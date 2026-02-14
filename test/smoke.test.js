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

  assert.equal(await exists(path.join(tmp, ".repo-memory", "manifest.json")), true);
  assert.equal(await exists(path.join(tmp, ".repo-memory", "index.json")), true);
  assert.equal(await exists(path.join(tmp, ".repo-memory", "rules.md")), true);
  assert.equal(await exists(path.join(tmp, ".repo-memory", "todos.md")), true);
  assert.equal(await exists(path.join(tmp, ".repo-memory", "context.md")), true);

  const journalDir = path.join(tmp, ".repo-memory", "journal");
  const ents = await fs.readdir(journalDir);
  assert.ok(ents.some((n) => n.endsWith(".md")), "journal file should exist");
});

