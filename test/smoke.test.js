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

function runNodeWithStdin(args, stdinText, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString("utf8")));
    p.stderr.on("data", (d) => (err += d.toString("utf8")));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code, out, err }));
    p.stdin.end(stdinText, "utf8");
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

function startNodeLongRunning(args, { cwd } = {}) {
  const p = spawn(process.execPath, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let err = "";
  p.stdout.on("data", (d) => (out += d.toString("utf8")));
  p.stderr.on("data", (d) => (err += d.toString("utf8")));
  return { p, getOut: () => out, getErr: () => err };
}

function startNodeStdio(args, { cwd } = {}) {
  const p = spawn(process.execPath, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
  let out = "";
  let err = "";
  p.stdout.on("data", (d) => (out += d.toString("utf8")));
  p.stderr.on("data", (d) => (err += d.toString("utf8")));
  return {
    p,
    writeLine: (obj) => p.stdin.write(JSON.stringify(obj) + "\n", "utf8"),
    getOut: () => out,
    getErr: () => err,
    closeIn: () => p.stdin.end()
  };
}

function parseJsonLines(s) {
  return String(s || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

async function waitFor(patternFn, { timeoutMs = 5000, intervalMs = 50 } = {}) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const v = patternFn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error("timeout waiting for condition");
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, intervalMs));
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
    const r = await runNode([rmemoBin, "--root", tmp, "--format", "md", "--mode", "brief", "status"]);
    assert.equal(r.code, 0, r.err || r.out);
    assert.ok(r.out.includes("# Status"), "status should output markdown");
    assert.ok(!r.out.includes("Rules (Excerpt)"), "brief status should not include rules excerpt");
    assert.ok(r.out.includes("## Next"), "status should include todos sections");
    assert.ok(r.out.match(/\n\d+\.\s+/), "brief status should number list items");
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
  await fs.writeFile(path.join(tmp, "secrets.txt"), "-----BEGIN PRIVATE KEY-----\n", "utf8");

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
    forbiddenContent: [
      {
        include: ["**/*.txt"],
        match: "BEGIN PRIVATE KEY",
        message: "Do not commit private keys."
      }
    ],
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
    assert.ok(r.err.includes("FAIL:"), "stderr should include fail summary");
    assert.ok(r.err.includes("== forbidden"), "stderr should group violations");
  }
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "--format", "json", "check"]);
    assert.equal(r.code, 1);
    const j = JSON.parse(r.out);
    assert.equal(j.schema, 1);
    assert.equal(j.ok, false);
    assert.ok(Array.isArray(j.violations));
    assert.ok(j.violations.length > 0);
  }

  // Fix violations
  await fs.writeFile(path.join(tmp, "README.md"), "# ok\n", "utf8");
  await fs.unlink(path.join(tmp, ".env"));
  await fs.writeFile(path.join(tmp, "secrets.txt"), "ok\n", "utf8");
  await fs.rename(path.join(tmp, "src", "pages", "BadName.vue"), path.join(tmp, "src", "pages", "bad-name.vue"));

  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "check"]);
    assert.equal(r.code, 0, r.err || r.out);
    assert.ok(r.out.includes("OK:"), "stdout should confirm OK");
  }
});

test("rmemo check supports requiredOneOf groups", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-oneof-"));

  // init creates rules.json; overwrite to include requiredOneOf.
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "init"]);
    assert.equal(r.code, 0, r.err || r.out);
  }

  const rulesPath = path.join(tmp, ".repo-memory", "rules.json");
  const rules = {
    schema: 1,
    requiredPaths: [],
    requiredOneOf: [["pnpm-lock.yaml", "package-lock.json", "yarn.lock"]],
    forbiddenPaths: [],
    forbiddenContent: [],
    namingRules: []
  };
  await fs.writeFile(rulesPath, JSON.stringify(rules, null, 2) + "\n", "utf8");

  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "check"]);
    assert.equal(r.code, 1, "should fail when none of the group exists");
    assert.ok(r.err.includes("required-oneof"), "should include group type");
  }

  await fs.writeFile(path.join(tmp, "pnpm-lock.yaml"), "lockfileVersion: 1\n", "utf8");
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "check"]);
    assert.equal(r.code, 0, r.err || r.out);
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
  assert.ok(hook.includes("--staged"), "hook should use --staged");

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

test("rmemo check --staged validates staged changes only", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-staged-"));

  // init a git repo
  {
    const r = await runCmd("git", ["init"], { cwd: tmp });
    assert.equal(r.code, 0, r.err || r.out);
  }
  // Ensure commits work on CI runners without preconfigured git identity.
  {
    const r1 = await runCmd("git", ["config", "user.name", "rmemo-test"], { cwd: tmp });
    assert.equal(r1.code, 0, r1.err || r1.out);
    const r2 = await runCmd("git", ["config", "user.email", "rmemo-test@example.com"], { cwd: tmp });
    assert.equal(r2.code, 0, r2.err || r2.out);
  }

  // init rmemo memory and commit it (so requiredPaths can be checked against repo files)
  {
    const r = await runNode([rmemoBin, "--root", tmp, "init"]);
    assert.equal(r.code, 0, r.err || r.out);
  }
  await fs.writeFile(
    path.join(tmp, ".repo-memory", "rules.json"),
    JSON.stringify(
      {
        schema: 1,
        requiredPaths: [],
        forbiddenPaths: [],
        forbiddenContent: [{ include: ["**/*.txt"], match: "BEGIN PRIVATE KEY" }],
        namingRules: []
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  // Commit baseline
  {
    const r = await runCmd("git", ["add", "-A"], { cwd: tmp });
    assert.equal(r.code, 0, r.err || r.out);
  }
  {
    const r = await runCmd("git", ["commit", "-m", "init"], { cwd: tmp });
    assert.equal(r.code, 0, r.err || r.out);
  }

  // Create a secret file but do not stage it yet
  await fs.writeFile(path.join(tmp, "secret.txt"), "BEGIN PRIVATE KEY\n", "utf8");

  {
    const r = await runNode([rmemoBin, "--root", tmp, "--staged", "check"]);
    assert.equal(r.code, 0, r.err || r.out);
  }

  // Stage it => should fail
  await runCmd("git", ["add", "secret.txt"], { cwd: tmp });

  // Make working tree clean-looking, but keep the staged content secret.
  await fs.writeFile(path.join(tmp, "secret.txt"), "ok\n", "utf8");

  {
    const r = await runNode([rmemoBin, "--root", tmp, "--staged", "check"]);
    assert.equal(r.code, 1, "staged secret should fail");
  }
});

test("scan detects monorepo signals and subprojects", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-scan-"));

  // root monorepo
  await fs.writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify(
      {
        name: "root",
        private: true,
        workspaces: ["apps/*", "packages/*"]
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  await fs.writeFile(path.join(tmp, "pnpm-workspace.yaml"), "packages:\n  - 'apps/*'\n", "utf8");

  // subprojects
  await fs.mkdir(path.join(tmp, "apps", "admin-web"), { recursive: true });
  await fs.writeFile(
    path.join(tmp, "apps", "admin-web", "package.json"),
    JSON.stringify({ name: "admin-web", dependencies: { vue: "^3.0.0" } }, null, 2) + "\n",
    "utf8"
  );

  await fs.mkdir(path.join(tmp, "apps", "miniapp"), { recursive: true });
  await fs.writeFile(path.join(tmp, "apps", "miniapp", "project.config.json"), "{\n}\n", "utf8");

  const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "scan"]);
  assert.equal(r.code, 0, r.err || r.out);

  const manifestPath = path.join(tmp, ".repo-memory", "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.ok(manifest.monorepo, "manifest should include monorepo");
  assert.ok(Array.isArray(manifest.monorepo.signals), "monorepo.signals should be array");
  assert.ok(manifest.monorepo.signals.includes("pnpm-workspace"), "should detect pnpm-workspace.yaml");
  assert.ok(Array.isArray(manifest.subprojects), "manifest should include subprojects");
  assert.ok(manifest.subprojects.some((p) => p.dir === "apps/admin-web"), "should detect apps/admin-web subproject");
  assert.ok(manifest.subprojects.some((p) => p.dir === "apps/miniapp"), "should detect apps/miniapp subproject");
});

test("scan supports --format json and md", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-scanfmt-"));

  await fs.writeFile(path.join(tmp, "README.md"), "# Demo\n", "utf8");
  await fs.writeFile(path.join(tmp, "openapi.yaml"), "openapi: 3.0.0\n", "utf8");

  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "--format", "json", "scan"]);
    assert.equal(r.code, 0, r.err || r.out);
    const m = JSON.parse(r.out);
    assert.equal(m.schema, 1);
    assert.ok(Array.isArray(m.keyFiles));
  }
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "--format", "md", "scan"]);
    assert.equal(r.code, 0, r.err || r.out);
    assert.ok(r.out.includes("# Scan Summary"));
    assert.ok(r.out.includes("API Contracts") || r.out.includes("Key Files"));
  }
});

test("rmemo start runs scan+context and prints status", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-start-"));

  await fs.writeFile(path.join(tmp, "README.md"), "# Demo\n", "utf8");
  await fs.writeFile(path.join(tmp, "package.json"), JSON.stringify({ name: "demo" }, null, 2) + "\n", "utf8");

  const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "start"]);
  assert.equal(r.code, 0, r.err || r.out);
  assert.ok(r.out.includes("# Status"), "start should print status");
  assert.ok(await exists(path.join(tmp, ".repo-memory", "manifest.json")), true);
  assert.ok(await exists(path.join(tmp, ".repo-memory", "context.md")), true);
  assert.ok(await exists(path.join(tmp, ".repo-memory", "rules.md")), true);
  assert.ok(await exists(path.join(tmp, ".repo-memory", "rules.json")), true);
  assert.ok(await exists(path.join(tmp, ".repo-memory", "todos.md")), true);
});

test("rmemo done appends journal and can update todos (args and stdin)", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-done-"));

  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "init"]);
    assert.equal(r.code, 0, r.err || r.out);
  }

  {
    const r = await runNode([
      rmemoBin,
      "--root",
      tmp,
      "done",
      "--next",
      "Tomorrow: do Z",
      "--blocker",
      "Waiting for API",
      "Today: did X"
    ]);
    assert.equal(r.code, 0, r.err || r.out);
  }

  const journalDir = path.join(tmp, ".repo-memory", "journal");
  const jf = (await fs.readdir(journalDir)).sort().pop();
  const jText = await fs.readFile(path.join(journalDir, jf), "utf8");
  assert.ok(jText.includes("Done"), "journal should include Done section");
  assert.ok(jText.includes("Today: did X"), "journal should include note");

  const todos = await fs.readFile(path.join(tmp, ".repo-memory", "todos.md"), "utf8");
  assert.ok(todos.includes("Tomorrow: do Z"), "todos should include next bullet");
  assert.ok(todos.includes("Waiting for API"), "todos should include blocker bullet");

  // stdin mode
  {
    const r = await runNodeWithStdin([rmemoBin, "--root", tmp, "done"], "stdin note\n");
    assert.equal(r.code, 0, r.err || r.out);
  }
});

test("rmemo todo add/block/ls updates todos file", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-todo-"));

  // Create without init: todo commands should still create todos.md.
  {
    const r = await runNode([rmemoBin, "--root", tmp, "todo", "add", "Do A"]);
    assert.equal(r.code, 0, r.err || r.out);
  }
  {
    const r = await runNode([rmemoBin, "--root", tmp, "todo", "add", "Do C"]);
    assert.equal(r.code, 0, r.err || r.out);
  }
  {
    const r = await runNode([rmemoBin, "--root", tmp, "todo", "block", "Blocked on B"]);
    assert.equal(r.code, 0, r.err || r.out);
  }
  {
    const r = await runNode([rmemoBin, "--root", tmp, "todo", "block", "Blocked on D"]);
    assert.equal(r.code, 0, r.err || r.out);
  }
  {
    const r = await runNode([rmemoBin, "--root", tmp, "todo", "ls"]);
    assert.equal(r.code, 0, r.err || r.out);
    assert.ok(r.out.includes("## Next"));
    assert.ok(r.out.includes("Do A"));
    assert.ok(r.out.includes("Do C"));
    assert.ok(r.out.includes("## Blockers"));
    assert.ok(r.out.includes("Blocked on B"));
    assert.ok(r.out.includes("Blocked on D"));
  }

  // Remove items by index
  {
    const r = await runNode([rmemoBin, "--root", tmp, "todo", "done", "1"]);
    assert.equal(r.code, 0, r.err || r.out);
  }
  {
    const r = await runNode([rmemoBin, "--root", tmp, "todo", "unblock", "2"]);
    assert.equal(r.code, 0, r.err || r.out);
  }
  {
    const r = await runNode([rmemoBin, "--root", tmp, "todo", "ls"]);
    assert.equal(r.code, 0, r.err || r.out);
    assert.ok(!r.out.includes("Do A"), "removed next item should be gone");
    assert.ok(r.out.includes("Do C"), "remaining next item should exist");
    assert.ok(r.out.includes("Blocked on B"), "remaining blocker should exist");
    assert.ok(!r.out.includes("Blocked on D"), "removed blocker should be gone");
  }
});

test("rmemo template ls/apply works", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-tpl-"));

  {
    const r = await runNode([rmemoBin, "template", "ls"]);
    assert.equal(r.code, 0, r.err || r.out);
    assert.ok(r.out.includes("web-admin-vue"));
  }

  {
    const r = await runNode([rmemoBin, "--root", tmp, "template", "apply", "web-admin-vue"]);
    assert.equal(r.code, 0, r.err || r.out);
  }

  const rulesMd = await fs.readFile(path.join(tmp, ".repo-memory", "rules.md"), "utf8");
  assert.ok(rulesMd.includes("Web Admin - Vue"));
});

test("rmemo init can apply template via --template", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-init-tpl-"));
  const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "--template", "miniapp", "init"]);
  assert.equal(r.code, 0, r.err || r.out);
  const rulesMd = await fs.readFile(path.join(tmp, ".repo-memory", "rules.md"), "utf8");
  assert.ok(rulesMd.includes("Mini App"));
});

test("rmemo sync generates AI instruction files and supports --check", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-sync-"));

  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "init"]);
    assert.equal(r.code, 0, r.err || r.out);
  }

  // First sync writes files
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "sync"]);
    assert.equal(r.code, 0, r.err || r.out);
  }

  assert.equal(await exists(path.join(tmp, "AGENTS.md")), true);
  assert.equal(await exists(path.join(tmp, ".github", "copilot-instructions.md")), true);
  assert.equal(await exists(path.join(tmp, ".cursor", "rules", "rmemo.mdc")), true);

  // Check mode should pass if in sync
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "--check", "sync"]);
    assert.equal(r.code, 0, r.err || r.out);
  }

  // Mutate one file => check should fail
  await fs.appendFile(path.join(tmp, "AGENTS.md"), "\ncustom\n", "utf8");
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "--check", "sync"]);
    assert.equal(r.code, 2, "check should detect diff");
  }
});

test("rmemo setup writes config and installs multiple git hooks", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-setup-"));

  // init a git repo
  {
    const r = await runCmd("git", ["init"], { cwd: tmp });
    assert.equal(r.code, 0, r.err || r.out);
  }

  // check mode should fail before setup
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--check", "setup"]);
    assert.equal(r.code, 2, "setup --check should fail before setup");
  }
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--check", "--format", "json", "setup"]);
    assert.equal(r.code, 2);
    const j = JSON.parse(r.out);
    assert.equal(j.schema, 1);
    assert.equal(j.ok, false);
    assert.ok(j.config);
    assert.ok(Array.isArray(j.hooks));
  }

  {
    const r = await runNode([rmemoBin, "--root", tmp, "setup"]);
    assert.equal(r.code, 0, r.err || r.out);
  }

  // check mode should pass after setup
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--check", "setup"]);
    assert.equal(r.code, 0, r.err || r.out);
  }
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--check", "--format", "json", "setup"]);
    assert.equal(r.code, 0, r.err || r.out);
    const j = JSON.parse(r.out);
    assert.equal(j.ok, true);
    assert.ok(j.root);
  }

  // config exists
  const cfgText = await fs.readFile(path.join(tmp, ".repo-memory", "config.json"), "utf8");
  const cfg = JSON.parse(cfgText);
  assert.equal(cfg.schema, 1);
  assert.equal(cfg.sync.enabled, true);
  assert.ok(Array.isArray(cfg.sync.targets));
  assert.ok(cfg.sync.targets.length > 0);

  // hooks exist
  const hooks = ["pre-commit", "post-commit", "post-merge", "post-checkout"];
  for (const h of hooks) {
    // eslint-disable-next-line no-await-in-loop
    const p = path.join(tmp, ".git", "hooks", h);
    // eslint-disable-next-line no-await-in-loop
    assert.equal(await exists(p), true, `hook should exist: ${h}`);
    // eslint-disable-next-line no-await-in-loop
    const s = await fs.readFile(p, "utf8");
    assert.ok(s.includes(`rmemo hook:${h}`), `hook marker should exist: ${h}`);
    if (h !== "pre-commit") {
      assert.ok(s.includes("embed auto"), `post hook should include embed auto: ${h}`);
    }
  }
});

test("rmemo setup --uninstall removes rmemo-managed hooks and can keep custom hooks", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-uninstall-"));

  {
    const r = await runCmd("git", ["init"], { cwd: tmp });
    assert.equal(r.code, 0, r.err || r.out);
  }

  // Install rmemo hooks/config
  {
    const r = await runNode([rmemoBin, "--root", tmp, "setup"]);
    assert.equal(r.code, 0, r.err || r.out);
  }

  // Uninstall should remove managed hooks (but keep config by default)
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--uninstall", "setup"]);
    assert.equal(r.code, 0, r.err || r.out);
  }

  const hooks = ["pre-commit", "post-commit", "post-merge", "post-checkout"];
  for (const h of hooks) {
    // eslint-disable-next-line no-await-in-loop
    assert.equal(await exists(path.join(tmp, ".git", "hooks", h)), false, `hook should be removed: ${h}`);
  }
  assert.equal(await exists(path.join(tmp, ".repo-memory", "config.json")), true, "config should remain by default");

  // Custom hook should not be removed
  await fs.writeFile(path.join(tmp, ".git", "hooks", "pre-commit"), "#!/usr/bin/env bash\necho custom\n", "utf8");
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--uninstall", "--hooks", "pre-commit", "setup"]);
    assert.equal(r.code, 2, "should skip external hook and exit 2");
  }
  assert.equal(await exists(path.join(tmp, ".git", "hooks", "pre-commit")), true);
});

test("rmemo handoff generates a one-file markdown and writes it to .repo-memory/handoff.md", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-handoff-"));

  await fs.writeFile(path.join(tmp, "README.md"), "# Demo\n", "utf8");
  await fs.writeFile(path.join(tmp, "package.json"), JSON.stringify({ name: "demo" }, null, 2) + "\n", "utf8");

  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "handoff"]);
    assert.equal(r.code, 0, r.err || r.out);
    assert.ok(r.out.includes("# Handoff"), "handoff should print markdown");
    assert.ok(r.out.includes("## Status (Brief)"), "handoff should include status section");
    assert.ok(r.out.includes("## Paste To AI"), "handoff should include paste guide");
  }

  const p = path.join(tmp, ".repo-memory", "handoff.md");
  assert.equal(await exists(p), true, "handoff.md should be written");
  const md = await fs.readFile(p, "utf8");
  assert.ok(md.includes("# Handoff"));
  assert.ok(md.includes(".repo-memory/context.md"), "handoff should reference context pack");
});

test("rmemo pr generates PR summary markdown and writes .repo-memory/pr.md", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-pr-"));

  // init a git repo
  {
    const r = await runCmd("git", ["init"], { cwd: tmp });
    assert.equal(r.code, 0, r.err || r.out);
  }
  // Ensure commits work on CI runners without preconfigured git identity.
  {
    const r1 = await runCmd("git", ["config", "user.name", "rmemo-test"], { cwd: tmp });
    assert.equal(r1.code, 0, r1.err || r1.out);
    const r2 = await runCmd("git", ["config", "user.email", "rmemo-test@example.com"], { cwd: tmp });
    assert.equal(r2.code, 0, r2.err || r2.out);
  }

  await fs.writeFile(path.join(tmp, "README.md"), "# Demo\n", "utf8");
  {
    const r = await runCmd("git", ["add", "-A"], { cwd: tmp });
    assert.equal(r.code, 0, r.err || r.out);
  }
  {
    const r = await runCmd("git", ["commit", "-m", "init"], { cwd: tmp });
    assert.equal(r.code, 0, r.err || r.out);
  }

  // second commit
  await fs.writeFile(path.join(tmp, "README.md"), "# Demo\n\nmore\n", "utf8");
  {
    const r = await runCmd("git", ["add", "-A"], { cwd: tmp });
    assert.equal(r.code, 0, r.err || r.out);
  }
  {
    const r = await runCmd("git", ["commit", "-m", "feat: update readme"], { cwd: tmp });
    assert.equal(r.code, 0, r.err || r.out);
  }

  // base is previous commit
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--base", "HEAD~1", "pr"]);
    assert.equal(r.code, 0, r.err || r.out);
    assert.ok(r.out.includes("# PR Summary"), "pr should print markdown");
    assert.ok(r.out.includes("## What Changed"), "pr should include changes section");
  }

  const p = path.join(tmp, ".repo-memory", "pr.md");
  assert.equal(await exists(p), true, "pr.md should be written");
  const md = await fs.readFile(p, "utf8");
  assert.ok(md.includes("feat: update readme"), "pr should include commit message");

  // json output
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--base", "HEAD~1", "--format", "json", "pr"]);
    assert.equal(r.code, 0, r.err || r.out);
    const j = JSON.parse(r.out);
    assert.equal(j.schema, 1);
    assert.ok(j.range.baseRef);
    assert.ok(j.range.baseSha);
  }
});

test("rmemo watch --once refreshes context (and does not hang)", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-watch-"));

  await fs.writeFile(path.join(tmp, "README.md"), "# Demo\n", "utf8");

  const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "--once", "watch"]);
  assert.equal(r.code, 0, r.err || r.out);
  assert.ok(await exists(path.join(tmp, ".repo-memory", "context.md")), true);
});

test("git-aware scan respects --root subdir (does not include sibling files)", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-gitscope-"));

  {
    const r = await runCmd("git", ["init"], { cwd: tmp });
    assert.equal(r.code, 0, r.err || r.out);
  }
  {
    const r1 = await runCmd("git", ["config", "user.name", "rmemo-test"], { cwd: tmp });
    assert.equal(r1.code, 0, r1.err || r1.out);
    const r2 = await runCmd("git", ["config", "user.email", "rmemo-test@example.com"], { cwd: tmp });
    assert.equal(r2.code, 0, r2.err || r2.out);
  }

  await fs.mkdir(path.join(tmp, "apps", "a"), { recursive: true });
  await fs.mkdir(path.join(tmp, "apps", "b"), { recursive: true });
  await fs.writeFile(path.join(tmp, "apps", "a", "a.txt"), "a\n", "utf8");
  await fs.writeFile(path.join(tmp, "apps", "b", "b.txt"), "b\n", "utf8");
  await runCmd("git", ["add", "-A"], { cwd: tmp });
  await runCmd("git", ["commit", "-m", "init"], { cwd: tmp });

  const r = await runNode([rmemoBin, "--root", path.join(tmp, "apps", "a"), "--format", "json", "scan"]);
  assert.equal(r.code, 0, r.err || r.out);
  const m = JSON.parse(r.out);
  assert.ok(m.fileCount >= 1);
  assert.ok(!m.keyFiles?.includes("apps/b/b.txt"), "should not include sibling files");

  const idxText = await fs.readFile(path.join(tmp, "apps", "a", ".repo-memory", "index.json"), "utf8");
  const idx = JSON.parse(idxText);
  assert.ok(idx.files.includes("a.txt"), "index should include a.txt");
  assert.ok(!idx.files.includes("apps/b/b.txt") && !idx.files.includes("b.txt"), "index should not include b");
});

test("rmemo ws ls lists detected subprojects", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-ws-"));

  await fs.writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "root", private: true, workspaces: ["apps/*"] }, null, 2) + "\n",
    "utf8"
  );
  await fs.writeFile(path.join(tmp, "pnpm-workspace.yaml"), "packages:\n  - 'apps/*'\n", "utf8");

  await fs.mkdir(path.join(tmp, "apps", "admin-web"), { recursive: true });
  await fs.writeFile(
    path.join(tmp, "apps", "admin-web", "package.json"),
    JSON.stringify({ name: "admin-web", dependencies: { vue: "^3.0.0" } }, null, 2) + "\n",
    "utf8"
  );

  await fs.mkdir(path.join(tmp, "apps", "miniapp"), { recursive: true });
  await fs.writeFile(path.join(tmp, "apps", "miniapp", "project.config.json"), "{\n}\n", "utf8");

  const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "ws", "ls"]);
  assert.equal(r.code, 0, r.err || r.out);
  assert.ok(r.out.includes("apps/admin-web"));
  assert.ok(r.out.includes("apps/miniapp"));
});

test("rmemo ws batch handoff generates handoff for all subprojects", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-ws-batch-"));

  await fs.writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "root", private: true, workspaces: ["apps/*"] }, null, 2) + "\n",
    "utf8"
  );
  await fs.writeFile(path.join(tmp, "pnpm-workspace.yaml"), "packages:\n  - 'apps/*'\n", "utf8");

  await fs.mkdir(path.join(tmp, "apps", "admin-web"), { recursive: true });
  await fs.writeFile(
    path.join(tmp, "apps", "admin-web", "package.json"),
    JSON.stringify({ name: "admin-web", dependencies: { vue: "^3.0.0" } }, null, 2) + "\n",
    "utf8"
  );

  await fs.mkdir(path.join(tmp, "apps", "miniapp"), { recursive: true });
  await fs.writeFile(path.join(tmp, "apps", "miniapp", "project.config.json"), "{\n}\n", "utf8");

  const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "--format", "json", "ws", "batch", "handoff"]);
  assert.equal(r.code, 0, r.err || r.out);
  const j = JSON.parse(r.out);
  assert.equal(j.schema, 1);
  assert.equal(j.cmd, "handoff");
  assert.ok(Array.isArray(j.results));
  assert.equal(j.results.length, 2);
  assert.ok(await exists(path.join(tmp, ".repo-memory", "ws.md")), true, "should write monorepo ws summary");
  assert.ok(await exists(path.join(tmp, "apps", "admin-web", ".repo-memory", "handoff.md")), true);
  assert.ok(await exists(path.join(tmp, "apps", "miniapp", ".repo-memory", "handoff.md")), true);
});

test("rmemo ws batch embed auto builds embeddings for all subprojects", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-ws-embed-"));

  await fs.writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "mono", private: true, workspaces: ["apps/*"] }, null, 2) + "\n",
    "utf8"
  );

  const apps = ["apps/a", "apps/b"];
  for (const d of apps) {
    const abs = path.join(tmp, d);
    await fs.mkdir(abs, { recursive: true });
    await fs.writeFile(path.join(abs, "package.json"), JSON.stringify({ name: d.replace("/", "-"), private: true }, null, 2) + "\n", "utf8");
    // init repo-memory files for each subproject
    // eslint-disable-next-line no-await-in-loop
    const r = await runNode([rmemoBin, "--root", abs, "--no-git", "init"]);
    assert.equal(r.code, 0, r.err || r.out);
    // enable embeddings via config
    const cfgPath = path.join(abs, ".repo-memory", "config.json");
    const cfg = JSON.parse(await fs.readFile(cfgPath, "utf8"));
    cfg.embed = { enabled: true, provider: "mock", dim: 32, kinds: ["rules", "todos"] };
    await fs.writeFile(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  }

  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "ws", "batch", "embed"]);
    assert.equal(r.code, 0, r.err || r.out);
  }
  for (const d of apps) {
    const idx = path.join(tmp, d, ".repo-memory", "embeddings", "index.json");
    // eslint-disable-next-line no-await-in-loop
    assert.equal(await exists(idx), true, `embeddings index should exist: ${d}`);
  }

  // Check mode should pass when nothing changed.
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "ws", "batch", "embed", "--check"]);
    assert.equal(r.code, 0, r.err || r.out);
  }

  // Modify one workspace => check should fail (exit 2).
  await fs.appendFile(path.join(tmp, "apps/a", ".repo-memory", "rules.md"), "\n- changed\n", "utf8");
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "ws", "batch", "embed", "--check"]);
    assert.equal(r.code, 2);
  }
});

test("rmemo ws focus runs focus for one workspace", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-ws-focus-"));

  await fs.writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "mono", private: true, workspaces: ["apps/*"] }, null, 2) + "\n",
    "utf8"
  );

  const wsDir = path.join(tmp, "apps", "admin-web");
  await fs.mkdir(wsDir, { recursive: true });
  await fs.writeFile(path.join(wsDir, "package.json"), JSON.stringify({ name: "admin-web", private: true }, null, 2) + "\n", "utf8");

  {
    const r = await runNode([rmemoBin, "--root", wsDir, "--no-git", "init"]);
    assert.equal(r.code, 0, r.err || r.out);
  }
  await fs.appendFile(path.join(wsDir, ".repo-memory", "rules.md"), "\n- auth token refresh must be documented.\n", "utf8");

  const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "ws", "focus", "apps/admin-web", "auth token", "--mode", "keyword"]);
  assert.equal(r.code, 0, r.err || r.out);
  assert.ok(r.out.includes("# Focus"));
  assert.ok(r.out.toLowerCase().includes("auth token"));
});

test("rmemo ws batch focus aggregates focus results across workspaces", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-ws-batch-focus-"));

  await fs.writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "mono", private: true, workspaces: ["apps/*"] }, null, 2) + "\n",
    "utf8"
  );

  const apps = ["apps/a", "apps/b"];
  for (const d of apps) {
    const abs = path.join(tmp, d);
    await fs.mkdir(abs, { recursive: true });
    await fs.writeFile(path.join(abs, "package.json"), JSON.stringify({ name: d.replace("/", "-"), private: true }, null, 2) + "\n", "utf8");
    // eslint-disable-next-line no-await-in-loop
    const r = await runNode([rmemoBin, "--root", abs, "--no-git", "init"]);
    assert.equal(r.code, 0, r.err || r.out);
    // eslint-disable-next-line no-await-in-loop
    await fs.appendFile(path.join(abs, ".repo-memory", "rules.md"), "\n- api auth token flow is tracked here.\n", "utf8");
  }

  const r = await runNode([
    rmemoBin,
    "--root",
    tmp,
    "--no-git",
    "--format",
    "json",
    "--mode",
    "keyword",
    "--no-status",
    "ws",
    "batch",
    "focus",
    "auth token flow"
  ]);
  assert.equal(r.code, 0, r.err || r.out);
  const j = JSON.parse(r.out);
  assert.equal(j.schema, 1);
  assert.equal(j.cmd, "focus");
  assert.ok(Array.isArray(j.results));
  assert.equal(j.results.length, 2);
  assert.ok(j.results.every((x) => x.ok === true));
  assert.ok(j.results.every((x) => Number(x.hits || 0) >= 1));
  assert.ok(await exists(path.join(tmp, ".repo-memory", "ws.md")), true);
});

test("rmemo ws focus snapshots can be saved, listed and compared", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-ws-focus-history-"));

  await fs.writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "mono", private: true, workspaces: ["apps/*"] }, null, 2) + "\n",
    "utf8"
  );
  const apps = ["apps/a", "apps/b"];
  for (const d of apps) {
    const abs = path.join(tmp, d);
    await fs.mkdir(path.join(abs, ".repo-memory"), { recursive: true });
    await fs.writeFile(path.join(abs, "package.json"), JSON.stringify({ name: d.replace("/", "-"), private: true }, null, 2) + "\n", "utf8");
    await fs.writeFile(path.join(abs, ".repo-memory", "rules.md"), "# Rules\n- auth token flow is tracked.\n", "utf8");
    await fs.writeFile(path.join(abs, ".repo-memory", "todos.md"), "## Next\n- verify auth token flow\n\n## Blockers\n- (none)\n", "utf8");
  }

  const r1 = await runNode([
    rmemoBin,
    "--root",
    tmp,
    "--no-git",
    "--format",
    "json",
    "--mode",
    "keyword",
    "ws",
    "batch",
    "focus",
    "auth token flow",
    "--save",
    "--tag",
    "d1"
  ]);
  assert.equal(r1.code, 0, r1.err || r1.out);
  const j1 = JSON.parse(r1.out);
  assert.ok(j1.snapshot && j1.snapshot.id);

  await fs.appendFile(path.join(tmp, "apps/b", ".repo-memory", "rules.md"), "\n- auth token flow auth token flow\n", "utf8");

  const r2 = await runNode([
    rmemoBin,
    "--root",
    tmp,
    "--no-git",
    "--format",
    "json",
    "--mode",
    "keyword",
    "ws",
    "batch",
    "focus",
    "auth token flow",
    "--save",
    "--compare-latest",
    "--tag",
    "d2"
  ]);
  assert.equal(r2.code, 0, r2.err || r2.out);
  const j2 = JSON.parse(r2.out);
  assert.ok(j2.snapshot && j2.snapshot.id);
  assert.ok(j2.comparison && j2.comparison.diff);

  const ls = await runNode([rmemoBin, "--root", tmp, "--format", "json", "ws", "focus-history", "list", "--limit", "10"]);
  assert.equal(ls.code, 0, ls.err || ls.out);
  const lsJson = JSON.parse(ls.out);
  assert.ok(Array.isArray(lsJson.snapshots));
  assert.ok(lsJson.snapshots.length >= 2);

  const cmp = await runNode([
    rmemoBin,
    "--root",
    tmp,
    "--format",
    "json",
    "ws",
    "focus-history",
    "compare",
    j1.snapshot.id,
    j2.snapshot.id
  ]);
  assert.equal(cmp.code, 0, cmp.err || cmp.out);
  const cmpJson = JSON.parse(cmp.out);
  assert.equal(cmpJson.schema, 1);
  assert.ok(cmpJson.diff);
  assert.ok(Array.isArray(cmpJson.diff.changes));

  const reportJson = await runNode([rmemoBin, "--root", tmp, "--format", "json", "ws", "focus-history", "report", j1.snapshot.id, j2.snapshot.id, "--max-items", "5"]);
  assert.equal(reportJson.code, 0, reportJson.err || reportJson.out);
  const reportJ = JSON.parse(reportJson.out);
  assert.equal(reportJ.schema, 1);
  assert.ok(reportJ.summary);
  assert.ok(Array.isArray(reportJ.topChanges));
  assert.ok(reportJ.topChanges.length >= 1);

  const reportMd = await runNode([rmemoBin, "--root", tmp, "ws", "focus-history", "report", j1.snapshot.id, j2.snapshot.id, "--format", "md"]);
  assert.equal(reportMd.code, 0, reportMd.err || reportMd.out);
  assert.ok(reportMd.out.includes("# Workspace Focus Drift Report"));
  assert.ok(reportMd.out.includes("## Summary"));
});

test("rmemo profile ls/describe/apply works", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-profile-"));

  {
    const r = await runNode([rmemoBin, "profile", "ls"]);
    assert.equal(r.code, 0, r.err || r.out);
    assert.ok(r.out.includes("web-admin-vue"));
  }

  {
    const r = await runNode([rmemoBin, "profile", "describe", "miniapp"]);
    assert.equal(r.code, 0, r.err || r.out);
    assert.ok(r.out.includes("# Profile: miniapp"));
  }

  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "profile", "apply", "miniapp"]);
    assert.equal(r.code, 0, r.err || r.out);
  }

  const rulesMd = await fs.readFile(path.join(tmp, ".repo-memory", "rules.md"), "utf8");
  assert.ok(rulesMd.includes("Mini App"));

  const cfg = JSON.parse(await fs.readFile(path.join(tmp, ".repo-memory", "config.json"), "utf8"));
  assert.equal(cfg.schema, 1);
  assert.equal(cfg.profile.id, "miniapp");

  // profile check should be clean
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "--format", "json", "profile", "check"]);
    assert.equal(r.code, 0, r.err || r.out);
    const j = JSON.parse(r.out);
    assert.equal(j.ok, true);
  }

  // introduce drift and verify check reports it
  await fs.appendFile(path.join(tmp, ".repo-memory", "rules.md"), "\nDrift\n", "utf8");
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "--format", "json", "profile", "check"]);
    assert.equal(r.code, 1, r.err || r.out);
    const j = JSON.parse(r.out);
    assert.equal(j.ok, false);
    assert.ok(j.files.some((f) => String(f.path).endsWith("/.repo-memory/rules.md") && f.status === "different"));
  }

  // upgrade should overwrite and create backups
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "profile", "upgrade", "miniapp"]);
    assert.equal(r.code, 0, r.err || r.out);
  }
  {
    const ents = await fs.readdir(path.join(tmp, ".repo-memory"));
    assert.ok(ents.some((n) => n.startsWith("rules.md.bak.")), "should create rules.md.bak.*");
  }
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "--format", "json", "profile", "check"]);
    assert.equal(r.code, 0, r.err || r.out);
    const j = JSON.parse(r.out);
    assert.equal(j.ok, true);
  }
});

test("rmemo init --auto recommends and applies a profile", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-init-auto-"));

  // miniapp signal
  await fs.mkdir(path.join(tmp, "src"), { recursive: true });
  await fs.writeFile(path.join(tmp, "project.config.json"), "{\n}\n", "utf8");

  const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "--auto", "init"]);
  assert.equal(r.code, 0, r.err || r.out);
  assert.ok(r.out.includes("Auto profile: miniapp"));

  const cfg = JSON.parse(await fs.readFile(path.join(tmp, ".repo-memory", "config.json"), "utf8"));
  assert.equal(cfg.profile.id, "miniapp");
});

test("rmemo session start/note/end works (no git)", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-session-"));

  const r1 = await runNode([rmemoBin, "--root", tmp, "--no-git", "--title", "Demo", "session", "start"]);
  assert.equal(r1.code, 0, r1.err || r1.out);

  const active = JSON.parse(await fs.readFile(path.join(tmp, ".repo-memory", "session.json"), "utf8"));
  assert.equal(active.schema, 1);
  assert.ok(active.id);

  const r2 = await runNode([rmemoBin, "--root", tmp, "--no-git", "session", "note", "hello"]);
  assert.equal(r2.code, 0, r2.err || r2.out);

  const notes = await fs.readFile(path.join(tmp, ".repo-memory", "sessions", active.id, "notes.md"), "utf8");
  assert.ok(notes.includes("hello"));

  const r3 = await runNode([rmemoBin, "--root", tmp, "--no-git", "session", "end"]);
  assert.equal(r3.code, 0, r3.err || r3.out);

  assert.equal(await exists(path.join(tmp, ".repo-memory", "session.json")), false, "active session pointer should be cleared");
  assert.equal(await exists(path.join(tmp, ".repo-memory", "sessions", active.id, "handoff.md")), true);
  assert.equal(await exists(path.join(tmp, ".repo-memory", "sessions", active.id, "context.md")), true);
});

test("rmemo handoff --format json writes handoff.json and includes structured git fields", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-handoff-json-"));

  // init a git repo
  {
    const r = await runCmd("git", ["init"], { cwd: tmp });
    assert.equal(r.code, 0, r.err || r.out);
  }
  {
    const r1 = await runCmd("git", ["config", "user.name", "rmemo-test"], { cwd: tmp });
    assert.equal(r1.code, 0, r1.err || r1.out);
    const r2 = await runCmd("git", ["config", "user.email", "rmemo-test@example.com"], { cwd: tmp });
    assert.equal(r2.code, 0, r2.err || r2.out);
  }
  await fs.writeFile(path.join(tmp, "README.md"), "# Demo\n", "utf8");
  await runCmd("git", ["add", "-A"], { cwd: tmp });
  await runCmd("git", ["commit", "-m", "init"], { cwd: tmp });

  const r = await runNode([rmemoBin, "--root", tmp, "--format", "json", "--since", "HEAD", "handoff"]);
  assert.equal(r.code, 0, r.err || r.out);
  const j = JSON.parse(r.out);
  assert.equal(j.schema, 1);
  assert.ok(j.git);
  assert.ok(Array.isArray(j.git.commits));
  assert.ok(Array.isArray(j.git.files));
  assert.equal(await exists(path.join(tmp, ".repo-memory", "handoff.json")), true);
});

test("rmemo serve exposes repo memory over local HTTP (token auth)", async (t) => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-serve-"));

  await fs.writeFile(path.join(tmp, "README.md"), "# Demo\n", "utf8");
  await fs.mkdir(path.join(tmp, "src"), { recursive: true });
  await fs.writeFile(path.join(tmp, "src", "index.js"), "console.log('hi')\n", "utf8");

  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "init"]);
    assert.equal(r.code, 0, r.err || r.out);
  }

  const token = "t";
  const srv = startNodeLongRunning([rmemoBin, "--root", tmp, "--no-git", "--token", token, "--port", "0", "--allow-shutdown", "serve"]);

  let baseUrl = "";
  try {
    baseUrl = await waitFor(() => {
      const m = srv.getOut().match(/Listening:\s+(http:\/\/[^\s]+)\s*/);
      return m ? m[1] : "";
    });
  } catch (e) {
    const blob = [String(e?.message || ""), srv.getOut(), srv.getErr()].join("\n");
    // Some sandboxes disallow listening sockets (EPERM). Skip in that case.
    if (blob.includes("listen EPERM") || blob.includes("EACCES") || blob.includes("EPERM")) {
      try {
        srv.p.kill("SIGKILL");
      } catch {
        // ignore
      }
      t.skip("Environment disallows listening sockets (EPERM).");
      return;
    }
    throw e;
  }

  {
    const r = await fetch(baseUrl + "/health");
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ok, true);
  }

  // token required for non-health endpoints
  {
    const r = await fetch(baseUrl + "/context");
    assert.equal(r.status, 401);
  }

  {
    const r = await fetch(baseUrl + "/context", { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(r.status, 200);
    const t = await r.text();
    assert.ok(t.includes("# Repo Context Pack"));
  }

  {
    const r = await fetch(baseUrl + "/status?format=json&mode=brief", { headers: { "x-rmemo-token": token } });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.schema, 1);
    assert.ok(j.todos);
  }

  {
    const r = await fetch(baseUrl + "/shutdown", { method: "POST", headers: { "x-rmemo-token": token } });
    assert.equal(r.status, 200);
  }

  await waitFor(() => (srv.p.exitCode !== null ? true : false), { timeoutMs: 5000 });
});

test("rmemo mcp serves tools over stdio (status + search)", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-mcp-"));

  await fs.writeFile(path.join(tmp, "README.md"), "# Demo\n", "utf8");
  await fs.mkdir(path.join(tmp, "src"), { recursive: true });
  await fs.writeFile(path.join(tmp, "src", "index.js"), "console.log('hi')\n", "utf8");

  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "init"]);
    assert.equal(r.code, 0, r.err || r.out);
  }

  const mcp = startNodeStdio([rmemoBin, "--root", tmp, "mcp"]);

  mcp.writeLine({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "0" } }
  });
  mcp.writeLine({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  mcp.writeLine({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  mcp.writeLine({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "rmemo_status", arguments: { root: tmp, mode: "brief", recentDays: 7 } }
  });
  mcp.writeLine({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "rmemo_search", arguments: { root: tmp, q: "Rules", scope: "context" } }
  });
  mcp.writeLine({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "rmemo_embed_status", arguments: { root: tmp } }
  });
  mcp.writeLine({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "rmemo_embed_plan", arguments: { root: tmp, provider: "mock", dim: 64 } }
  });

  await waitFor(() => {
    const lines = parseJsonLines(mcp.getOut());
    return lines.some((x) => x.id === 6) ? true : false;
  });

  const lines = parseJsonLines(mcp.getOut());
  const init = lines.find((x) => x.id === 1);
  assert.equal(init.result.serverInfo.name, "rmemo");

  const list = lines.find((x) => x.id === 2);
  assert.ok(Array.isArray(list.result.tools));
  assert.ok(list.result.tools.some((t2) => t2.name === "rmemo_status"));

  const status = lines.find((x) => x.id === 3);
  assert.ok(status.result.content[0].text.includes("\"schema\": 1"));

  const search = lines.find((x) => x.id === 4);
  const searchJson = JSON.parse(search.result.content[0].text);
  assert.equal(searchJson.schema, 1);
  assert.ok(Array.isArray(searchJson.hits));

  const embStatus = lines.find((x) => x.id === 5);
  const embStatusJson = JSON.parse(embStatus.result.content[0].text);
  assert.equal(embStatusJson.schema, 1);
  assert.ok(typeof embStatusJson.status === "string");

  const embPlan = lines.find((x) => x.id === 6);
  const embPlanJson = JSON.parse(embPlan.result.content[0].text);
  assert.equal(embPlanJson.schema, 1);
  assert.ok(embPlanJson.summary);
  assert.ok(Array.isArray(embPlanJson.files));
  assert.equal(embPlanJson.runtime.parallelism, 4);

  mcp.closeIn();
  try {
    mcp.p.kill("SIGTERM");
  } catch {
    // ignore
  }
});

test("rmemo mcp workspace tools list and focus across subprojects", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-mcp-ws-"));

  await fs.writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "mono", private: true, workspaces: ["apps/*"] }, null, 2) + "\n",
    "utf8"
  );
  const apps = ["apps/a", "apps/b"];
  for (const d of apps) {
    const abs = path.join(tmp, d);
    await fs.mkdir(path.join(abs, ".repo-memory"), { recursive: true });
    await fs.writeFile(path.join(abs, "package.json"), JSON.stringify({ name: d.replace("/", "-"), private: true }, null, 2) + "\n", "utf8");
    await fs.writeFile(path.join(abs, ".repo-memory", "rules.md"), "# Rules\n- auth token flow is tracked.\n", "utf8");
    await fs.writeFile(path.join(abs, ".repo-memory", "todos.md"), "## Next\n- verify auth token flow\n\n## Blockers\n- (none)\n", "utf8");
  }

  const mcp = startNodeStdio([rmemoBin, "--root", tmp, "--no-git", "mcp"]);
  try {
    mcp.writeLine({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "0" } }
    });
    mcp.writeLine({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
    mcp.writeLine({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    mcp.writeLine({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "rmemo_ws_list", arguments: { root: tmp, noGit: true } }
    });
    mcp.writeLine({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "rmemo_ws_focus", arguments: { root: tmp, q: "auth token flow", mode: "keyword", noGit: true, saveSnapshot: true, tag: "mcp-d1" } }
    });

    await waitFor(() => {
      const lines = parseJsonLines(mcp.getOut());
      return lines.some((x) => x.id === 4);
    });

    const lines = parseJsonLines(mcp.getOut());
    const list = lines.find((x) => x.id === 2);
    assert.ok(list.result.tools.some((t2) => t2.name === "rmemo_ws_list"));
    assert.ok(list.result.tools.some((t2) => t2.name === "rmemo_ws_focus"));
    assert.ok(list.result.tools.some((t2) => t2.name === "rmemo_ws_focus_snapshots"));
    assert.ok(list.result.tools.some((t2) => t2.name === "rmemo_ws_focus_compare"));
    assert.ok(list.result.tools.some((t2) => t2.name === "rmemo_ws_focus_report"));

    const wsList = lines.find((x) => x.id === 3);
    const wsListJson = JSON.parse(wsList.result.content[0].text);
    assert.equal(wsListJson.schema, 1);
    assert.ok(Array.isArray(wsListJson.subprojects));
    assert.equal(wsListJson.subprojects.length, 2);

    const wsFocus = lines.find((x) => x.id === 4);
    assert.ok(wsFocus, "ws focus response missing");
    assert.ok(!wsFocus.error, `ws focus error: ${wsFocus.error ? wsFocus.error.message : ""}`);
    const wsFocusJson = JSON.parse(wsFocus.result.content[0].text);
    assert.equal(wsFocusJson.schema, 1);
    assert.ok(Array.isArray(wsFocusJson.results));
    assert.equal(wsFocusJson.results.length, 2);
    assert.ok(wsFocusJson.results.every((x) => x.ok === true));
    assert.ok(wsFocusJson.snapshot && wsFocusJson.snapshot.id);

    mcp.writeLine({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "rmemo_ws_focus_snapshots", arguments: { root: tmp, limit: 5 } }
    });
    await waitFor(() => {
      const lines2 = parseJsonLines(mcp.getOut());
      return lines2.some((x) => x.id === 5);
    });

    const linesAfterSnap = parseJsonLines(mcp.getOut());
    const wsSnap = linesAfterSnap.find((x) => x.id === 5);
    const wsSnapJson = JSON.parse(wsSnap.result.content[0].text);
    assert.equal(wsSnapJson.schema, 1);
    assert.ok(Array.isArray(wsSnapJson.snapshots));
    assert.ok(wsSnapJson.snapshots.length >= 1);

    const sid = wsSnapJson.snapshots[0].id;
    assert.ok(typeof sid === "string" && sid.length > 0);
    mcp.writeLine({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "rmemo_ws_focus_compare", arguments: { root: tmp, fromId: sid, toId: sid } }
    });
    await waitFor(() => {
      const lines2 = parseJsonLines(mcp.getOut());
      return lines2.some((x) => x.id === 6);
    });
    const lines2 = parseJsonLines(mcp.getOut());
    const wsCmp = lines2.find((x) => x.id === 6);
    const wsCmpJson = JSON.parse(wsCmp.result.content[0].text);
    assert.equal(wsCmpJson.schema, 1);
    assert.ok(wsCmpJson.diff);
    assert.equal(wsCmpJson.diff.changedCount, 0);

    mcp.writeLine({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "rmemo_ws_focus_report", arguments: { root: tmp, fromId: sid, toId: sid, format: "json", maxItems: 5 } }
    });
    await waitFor(() => {
      const lines3 = parseJsonLines(mcp.getOut());
      return lines3.some((x) => x.id === 7);
    });
    const lines3 = parseJsonLines(mcp.getOut());
    const wsRpt = lines3.find((x) => x.id === 7);
    const wsRptJson = JSON.parse(wsRpt.result.content[0].text);
    assert.equal(wsRptJson.schema, 1);
    assert.ok(wsRptJson.summary);
    assert.ok(Array.isArray(wsRptJson.topChanges));
  } finally {
    mcp.closeIn();
    try {
      mcp.p.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
});

test("rmemo mcp --allow-write exposes write tools and can update repo memory", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-mcpw-"));

  await fs.writeFile(path.join(tmp, "README.md"), "# Demo\n", "utf8");

  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "init"]);
    assert.equal(r.code, 0, r.err || r.out);
  }

  const mcp = startNodeStdio([rmemoBin, "--root", tmp, "mcp", "--allow-write"]);
  try {
    mcp.writeLine({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "0" } }
    });
    mcp.writeLine({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
    mcp.writeLine({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    mcp.writeLine({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "rmemo_todo_add", arguments: { root: tmp, kind: "next", text: "Add MCP write tools" } }
    });
    mcp.writeLine({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "rmemo_log", arguments: { root: tmp, kind: "Note", text: "MCP write test" } }
    });
    mcp.writeLine({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "rmemo_embed_jobs", arguments: {} }
    });
    mcp.writeLine({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "rmemo_embed_jobs_config", arguments: { action: "set", maxConcurrent: 2, retryTemplate: "aggressive" } }
    });
    mcp.writeLine({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "rmemo_embed_jobs_failures", arguments: { limit: 10 } }
    });
    mcp.writeLine({
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: { name: "rmemo_embed_jobs_retry_failed", arguments: { limit: 2 } }
    });
    mcp.writeLine({
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "rmemo_embed_jobs_governance", arguments: {} }
    });
    mcp.writeLine({
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: {
        name: "rmemo_embed_jobs_governance_config",
        arguments: {
          action: "set",
          governanceEnabled: true,
          governanceWindow: 10,
          benchmarkAutoAdoptEnabled: true,
          benchmarkAutoAdoptMinScore: 0,
          benchmarkAutoAdoptMinGap: 0
        }
      }
    });
    mcp.writeLine({
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: { name: "rmemo_embed_jobs_governance_apply", arguments: { source: "test" } }
    });
    mcp.writeLine({
      jsonrpc: "2.0",
      id: 12,
      method: "tools/call",
      params: { name: "rmemo_embed_jobs_governance_history", arguments: { limit: 10 } }
    });
    mcp.writeLine({
      jsonrpc: "2.0",
      id: 13,
      method: "tools/call",
      params: { name: "rmemo_embed_jobs_governance_rollback", arguments: { versionId: "no-such-version", source: "test" } }
    });
    mcp.writeLine({
      jsonrpc: "2.0",
      id: 14,
      method: "tools/call",
      params: {
        name: "rmemo_embed_jobs_governance_simulate",
        arguments: { mode: "apply_top", governanceEnabled: true, governanceWindow: 10, governanceFailureRateHigh: 0.3, retryTemplate: "balanced" }
      }
    });
    mcp.writeLine({
      jsonrpc: "2.0",
      id: 15,
      method: "tools/call",
      params: {
        name: "rmemo_embed_jobs_governance_benchmark",
        arguments: { mode: "apply_top", windowSizes: [10, 20] }
      }
    });
    mcp.writeLine({
      jsonrpc: "2.0",
      id: 16,
      method: "tools/call",
      params: {
        name: "rmemo_embed_jobs_governance_benchmark_adopt",
        arguments: { source: "test", mode: "apply_top", windowSizes: [10, 20] }
      }
    });

    await waitFor(() => {
      const lines = parseJsonLines(mcp.getOut());
      return lines.some((x) => x.id === 16) ? true : false;
    });

    const lines = parseJsonLines(mcp.getOut());
    const list = lines.find((x) => x.id === 2);
    assert.ok(list.result.tools.some((t2) => t2.name === "rmemo_todo_add"));
    assert.ok(list.result.tools.some((t2) => t2.name === "rmemo_log"));
    assert.ok(list.result.tools.some((t2) => t2.name === "rmemo_embed_job_enqueue"));
    assert.ok(list.result.tools.some((t2) => t2.name === "rmemo_embed_jobs"));
    assert.ok(list.result.tools.some((t2) => t2.name === "rmemo_embed_jobs_failures"));
    assert.ok(list.result.tools.some((t2) => t2.name === "rmemo_embed_jobs_config"));
    assert.ok(list.result.tools.some((t2) => t2.name === "rmemo_embed_jobs_retry_failed"));
    assert.ok(list.result.tools.some((t2) => t2.name === "rmemo_embed_jobs_governance"));
    assert.ok(list.result.tools.some((t2) => t2.name === "rmemo_embed_jobs_governance_config"));
    assert.ok(list.result.tools.some((t2) => t2.name === "rmemo_embed_jobs_governance_apply"));
    assert.ok(list.result.tools.some((t2) => t2.name === "rmemo_embed_jobs_governance_history"));
    assert.ok(list.result.tools.some((t2) => t2.name === "rmemo_embed_jobs_governance_rollback"));
    assert.ok(list.result.tools.some((t2) => t2.name === "rmemo_embed_jobs_governance_simulate"));
    assert.ok(list.result.tools.some((t2) => t2.name === "rmemo_embed_jobs_governance_benchmark"));
    assert.ok(list.result.tools.some((t2) => t2.name === "rmemo_embed_jobs_governance_benchmark_adopt"));

    const todosMd = await fs.readFile(path.join(tmp, ".repo-memory", "todos.md"), "utf8");
    assert.ok(todosMd.includes("Add MCP write tools"));

    const journalDir = path.join(tmp, ".repo-memory", "journal");
    const jFiles = (await fs.readdir(journalDir)).filter((x) => x.endsWith(".md"));
    assert.ok(jFiles.length >= 1);
    const j = await fs.readFile(path.join(journalDir, jFiles[0]), "utf8");
    assert.ok(j.includes("MCP write test"));

    const jobs = lines.find((x) => x.id === 5);
    const jobsJson = JSON.parse(jobs.result.content[0].text);
    assert.equal(jobsJson.schema, 1);
    assert.ok(
      (jobsJson.active && jobsJson.active.id) ||
        (Array.isArray(jobsJson.queued) && jobsJson.queued.length >= 0) ||
        (Array.isArray(jobsJson.history) && jobsJson.history.length >= 0)
    );

    const cfg = lines.find((x) => x.id === 6);
    const cfgJson = JSON.parse(cfg.result.content[0].text);
    assert.equal(cfgJson.ok, true);
    assert.equal(cfgJson.config.maxConcurrent, 2);
    assert.equal(cfgJson.config.retryTemplate, "aggressive");

    const failures = lines.find((x) => x.id === 7);
    const failuresJson = JSON.parse(failures.result.content[0].text);
    assert.equal(failuresJson.ok, true);
    assert.ok(Array.isArray(failuresJson.failures));

    const retryFailed = lines.find((x) => x.id === 8);
    const retryFailedJson = JSON.parse(retryFailed.result.content[0].text);
    assert.equal(retryFailedJson.ok, true);
    assert.ok(retryFailedJson.result);

    const gov = lines.find((x) => x.id === 9);
    const govJson = JSON.parse(gov.result.content[0].text);
    assert.equal(govJson.ok, true);
    assert.ok(govJson.report);

    const govCfg = lines.find((x) => x.id === 10);
    const govCfgJson = JSON.parse(govCfg.result.content[0].text);
    assert.equal(govCfgJson.ok, true);
    assert.equal(govCfgJson.config.governanceEnabled, true);
    assert.equal(govCfgJson.config.benchmarkAutoAdoptEnabled, true);

    const govApply = lines.find((x) => x.id === 11);
    if (govApply.error) {
      const m = String(govApply.error.message || "");
      assert.ok(
        m.includes("no recommendation") ||
          m.includes("no_recommendation") ||
          m.includes("no_effective_action")
      );
    } else {
      const govApplyJson = JSON.parse(govApply.result.content[0].text);
      assert.equal(govApplyJson.ok, true);
      assert.ok(govApplyJson.result);
    }

    const govHist = lines.find((x) => x.id === 12);
    const govHistJson = JSON.parse(govHist.result.content[0].text);
    assert.equal(govHistJson.ok, true);
    assert.ok(Array.isArray(govHistJson.versions));
    assert.ok(govHistJson.versions.length >= 1);

    const govRollback = lines.find((x) => x.id === 13);
    assert.ok(govRollback.error || govRollback.result);
    if (govRollback.error) {
      assert.ok(String(govRollback.error.message || "").includes("version_not_found"));
    }

    const govSim = lines.find((x) => x.id === 14);
    const govSimJson = JSON.parse(govSim.result.content[0].text);
    assert.equal(govSimJson.ok, true);
    assert.ok(govSimJson.result);
    assert.ok(govSimJson.result.prediction);
    assert.ok(govSimJson.result.simulatedConfig);

    const govBench = lines.find((x) => x.id === 15);
    const govBenchJson = JSON.parse(govBench.result.content[0].text);
    assert.equal(govBenchJson.ok, true);
    assert.ok(govBenchJson.result);
    assert.ok(Array.isArray(govBenchJson.result.ranking));
    assert.ok(govBenchJson.result.recommendation);

    const govBenchAdopt = lines.find((x) => x.id === 16);
    if (govBenchAdopt.error) {
      assert.ok(String(govBenchAdopt.error.message || "").length > 0);
    } else {
      const govBenchAdoptJson = JSON.parse(govBenchAdopt.result.content[0].text);
      assert.equal(govBenchAdoptJson.ok, true);
      assert.equal(govBenchAdoptJson.result.ok, true);
    }
  } finally {
    mcp.closeIn();
    try {
      mcp.p.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
});

test("rmemo embed build/search supports semantic search (mock provider)", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-embed-"));

  await fs.writeFile(path.join(tmp, "README.md"), "# Demo\n", "utf8");
  await fs.writeFile(path.join(tmp, "api.md"), "Auth token is validated in middleware.\n", "utf8");

  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "init"]);
    assert.equal(r.code, 0, r.err || r.out);
  }

  // Make rules/todos mention a phrase we will query.
  await fs.writeFile(path.join(tmp, ".repo-memory", "rules.md"), "# Rules\n- Always validate auth token.\n", "utf8");
  await fs.writeFile(path.join(tmp, ".repo-memory", "todos.md"), "## Next\n- Add auth token refresh\n\n## Blockers\n- (none)\n", "utf8");
  {
    const r = await runNode([rmemoBin, "--root", tmp, "context"]);
    assert.equal(r.code, 0, r.err || r.out);
  }

  {
    const r = await runNode([rmemoBin, "--root", tmp, "embed", "build", "--provider", "mock", "--dim", "64", "--parallel", "2"]);
    assert.equal(r.code, 0, r.err || r.out);
    assert.ok(r.out.includes("parallelism: 2"));
    assert.ok(r.out.includes("totalBatches:"));
    assert.ok(await exists(path.join(tmp, ".repo-memory", "embeddings", "index.json")));
    assert.ok(await exists(path.join(tmp, ".repo-memory", "embeddings", "meta.json")));
  }

  {
    const r = await runNode([rmemoBin, "--root", tmp, "embed", "build", "--provider", "mock", "--dim", "64", "--check"]);
    assert.equal(r.code, 0, r.err || r.out);
    assert.ok(r.out.includes("up to date"));
  }

  // Rebuild with a different dim: should not reuse previous vectors and should update index dim.
  {
    const r = await runNode([rmemoBin, "--root", tmp, "embed", "build", "--provider", "mock", "--dim", "128"]);
    assert.equal(r.code, 0, r.err || r.out);
    const idx = JSON.parse(await fs.readFile(path.join(tmp, ".repo-memory", "embeddings", "index.json"), "utf8"));
    assert.equal(idx.schema, 1);
    assert.equal(idx.provider, "mock");
    assert.equal(idx.dim, 128);
    // Sanity: vectors should decode to 128 float32.
    const first = idx.items && idx.items.find((x) => x.vectorB64);
    assert.ok(first, "index should have vectors");
    const buf = Buffer.from(first.vectorB64, "base64");
    assert.equal(buf.byteLength / 4, 128);
  }

  // Modify a file that is part of the index; check should fail.
  await fs.writeFile(path.join(tmp, ".repo-memory", "rules.md"), "# Rules\n- validate auth token always (updated)\n", "utf8");
  {
    const r = await runNode([rmemoBin, "--root", tmp, "embed", "build", "--provider", "mock", "--dim", "128", "--check"]);
    assert.equal(r.code, 1);
    assert.ok(r.err.includes("out of date"));
  }

  {
    const r = await runNode([rmemoBin, "--root", tmp, "embed", "search", "auth token", "--format", "json"]);
    assert.equal(r.code, 0, r.err || r.out);
    const j = JSON.parse(r.out);
    assert.equal(j.schema, 1);
    assert.equal(j.q, "auth token");
    assert.ok(Array.isArray(j.hits));
    assert.ok(j.hits.length > 0, "semantic search should return hits");
    assert.ok(j.hits.some((h) => String(h.text || "").toLowerCase().includes("auth token")));
  }

  {
    const r = await runNode([rmemoBin, "--root", tmp, "embed", "status", "--format", "json"]);
    assert.equal(r.code, 0, r.err || r.out);
    const j = JSON.parse(r.out);
    assert.equal(j.schema, 1);
    assert.ok(j.index && j.index.exists);
    assert.ok(typeof j.status === "string");
  }

  {
    const r = await runNode([rmemoBin, "--root", tmp, "embed", "plan", "--provider", "mock", "--dim", "128", "--parallel", "3", "--format", "json"]);
    assert.equal(r.code, 0, r.err || r.out);
    const j = JSON.parse(r.out);
    assert.equal(j.schema, 1);
    assert.ok(j.summary);
    assert.ok(Array.isArray(j.files));
    assert.equal(j.runtime.parallelism, 3);
  }
});

test("rmemo embed auto respects config.json (enabled/disabled)", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-embed-auto-"));

  await fs.writeFile(path.join(tmp, "README.md"), "# Demo\n", "utf8");
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "init"]);
    assert.equal(r.code, 0, r.err || r.out);
  }

  // Disabled => no index created.
  await fs.writeFile(
    path.join(tmp, ".repo-memory", "config.json"),
    JSON.stringify({ schema: 1, sync: { enabled: true, targets: ["agents"] }, embed: { enabled: false } }, null, 2) + "\n",
    "utf8"
  );
  {
    const r = await runNode([rmemoBin, "--root", tmp, "embed", "auto"]);
    assert.equal(r.code, 0, r.err || r.out);
    assert.ok(!r.err.includes("FAIL"), "disabled should not fail");
    assert.equal(await exists(path.join(tmp, ".repo-memory", "embeddings", "index.json")), false);
  }

  // Enabled => builds index.
  await fs.writeFile(
    path.join(tmp, ".repo-memory", "config.json"),
    JSON.stringify(
      { schema: 1, sync: { enabled: true, targets: ["agents"] }, embed: { enabled: true, provider: "mock", dim: 32, kinds: ["rules", "todos"] } },
      null,
      2
    ) + "\n",
    "utf8"
  );
  {
    const r = await runNode([rmemoBin, "--root", tmp, "embed", "auto"]);
    assert.equal(r.code, 0, r.err || r.out);
    assert.equal(await exists(path.join(tmp, ".repo-memory", "embeddings", "index.json")), true);
  }
});

test("rmemo focus generates a paste-ready pack (semantic with fallback)", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-focus-"));

  await fs.writeFile(path.join(tmp, "README.md"), "# Demo\n", "utf8");
  {
    const r = await runNode([rmemoBin, "--root", tmp, "--no-git", "init"]);
    assert.equal(r.code, 0, r.err || r.out);
  }
  await fs.writeFile(path.join(tmp, ".repo-memory", "rules.md"), "# Rules\n- Always validate auth token.\n", "utf8");
  await fs.writeFile(path.join(tmp, ".repo-memory", "todos.md"), "## Next\n- Fix auth token refresh\n\n## Blockers\n- (none)\n", "utf8");

  // With no embeddings index, semantic mode should fall back to keyword and still find something.
  {
    const r = await runNode([rmemoBin, "--root", tmp, "focus", "auth token"]);
    assert.equal(r.code, 0, r.err || r.out);
    assert.ok(r.out.includes("# Focus"));
    assert.ok(r.out.toLowerCase().includes("auth token"));
    assert.ok(r.out.includes("## Top Hits"));
  }

  // After embeddings build, focus should work in json mode too.
  {
    const r1 = await runNode([rmemoBin, "--root", tmp, "embed", "build", "--provider", "mock", "--dim", "32"]);
    assert.equal(r1.code, 0, r1.err || r1.out);
    const r2 = await runNode([rmemoBin, "--root", tmp, "focus", "auth token", "--format", "json"]);
    assert.equal(r2.code, 0, r2.err || r2.out);
    const j = JSON.parse(r2.out);
    assert.equal(j.schema, 1);
    assert.equal(j.q, "auth token");
    assert.ok(j.search);
  }
});
