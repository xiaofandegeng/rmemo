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
  await runCmd("git", ["add", "-A"], { cwd: tmp });
  await runCmd("git", ["commit", "-m", "init"], { cwd: tmp });

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
