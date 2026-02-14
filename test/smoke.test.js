import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

function runNode(args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString("utf8")));
    p.stderr.on("data", (d) => (err += d.toString("utf8")));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code, out, err }));
  });
}

function runCmd(bin, args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString("utf8")));
    p.stderr.on("data", (d) => (err += d.toString("utf8")));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code, out, err }));
  });
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

test("rmemo init/log/context works on a generic repo (no git)", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-smoke-"));

  // A fake repo with a couple files, to exercise scanning heuristics.
  await fs.writeFile(path.join(tmp, "README.md"), "# Demo\n", "utf8");
  await fs.writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "demo-repo", private: true, scripts: { dev: "node index.js" } }, null, 2) + "\n",
    "utf8"
  );
  await fs.mkdir(path.join(tmp, "src"), { recursive: true });
  await fs.writeFile(path.join(tmp, "src", "index.js"), "console.log('hi')\n", "utf8");

  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "init"]);
    assert.equal(r.code, 0, r.err || r.out);
  }
  {
    const r = await runNode([rmemoBin, "--root", tmp, "log", "did x; next y"]);
    assert.equal(r.code, 0, r.err || r.out);
  }
  {
    const r = await runNode([rmemoBin, "--root", tmp, "context"]);
    assert.equal(r.code, 0, r.err || r.out);
  }
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--format", "md", "status"]);
    assert.equal(r.code, 0, r.err || r.out);
    assert.ok(r.out.includes("# Status"), "status should output markdown");
  }

  assert.equal(await exists(path.join(tmp, ".repo-memory", "manifest.json")), true);
  assert.equal(await exists(path.join(tmp, ".repo-memory", "index.json")), true);
  assert.equal(await exists(path.join(tmp, ".repo-memory", "rules.md")), true);
  assert.equal(await exists(path.join(tmp, ".repo-memory", "todos.md")), true);
  assert.equal(await exists(path.join(tmp, ".repo-memory", "context.md")), true);

  const journalDir = path.join(tmp, ".repo-memory", "journal");
  const ents = await fs.readdir(journalDir);
  assert.ok(ents.some((n) => n.endsWith(".md")), "journal file should exist");
});

test("rmemo check enforces forbidden/required/naming rules", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-check-"));

  await fs.mkdir(path.join(tmp, "src", "pages"), { recursive: true });
  await fs.writeFile(path.join(tmp, "src", "pages", "BadName.vue"), "<template />\n", "utf8");
  await fs.writeFile(path.join(tmp, ".env"), "SECRET=1\n", "utf8");

  // init will create rules.json; overwrite to include our checks.
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "init"]);
    assert.equal(r.code, 0, r.err || r.out);
  }

  const rulesPath = path.join(tmp, ".repo-memory", "rules.json");
  const rules = {
    schema: 1,
    requiredPaths: ["README.md"],
    forbiddenPaths: [".env", ".env.*"],
    namingRules: [
      {
        include: ["src/pages/**"],
        target: "basename",
        match: "^[a-z0-9-]+\\.vue$",
        message: "Page filenames must be kebab-case."
      }
    ]
  };
  await fs.writeFile(rulesPath, JSON.stringify(rules, null, 2) + "\n", "utf8");

  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "check"]);
    assert.equal(r.code, 1, "check should fail with violations");
    assert.ok(r.err.includes("VIOLATION:"), "stderr should include violations");
  }

  // Fix violations
  await fs.writeFile(path.join(tmp, "README.md"), "# ok\n", "utf8");
  await fs.unlink(path.join(tmp, ".env"));
  await fs.rename(path.join(tmp, "src", "pages", "BadName.vue"), path.join(tmp, "src", "pages", "bad-name.vue"));

  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "check"]);
    assert.equal(r.code, 0, r.err || r.out);
    assert.ok(r.out.includes("OK:"), "stdout should confirm OK");
  }
});

test("rmemo hook install writes pre-commit hook (and respects --force)", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-hook-"));

  // init a git repo
  {
    const r = await runCmd("git", ["init"], { cwd: tmp });
    assert.equal(r.code, 0, r.err || r.out);
  }

  // install hook
  {
    const r = await runNode([rmemoBin, "--root", tmp, "hook", "install"]);
    assert.equal(r.code, 0, r.err || r.out);
  }

  const hookPath = path.join(tmp, ".git", "hooks", "pre-commit");
  assert.equal(await exists(hookPath), true);
  const hook = await fs.readFile(hookPath, "utf8");
  assert.ok(hook.includes("rmemo pre-commit hook"), "hook should include marker");
  assert.ok(hook.includes(" check"), "hook should call check");

  // existing non-rmemo hook should block unless --force
  await fs.writeFile(hookPath, "#!/usr/bin/env bash\necho custom\n", "utf8");
  {
    const r = await runNode([rmemoBin, "--root", tmp, "hook", "install"]);
    assert.equal(r.code, 2, "should refuse to overwrite");
  }
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--force", "hook", "install"]);
    assert.equal(r.code, 0, r.err || r.out);
  }
  const hook2 = await fs.readFile(hookPath, "utf8");
  assert.ok(hook2.includes("rmemo pre-commit hook"));
});
