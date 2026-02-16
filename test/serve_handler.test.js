import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { createEventsBus, createServeHandler, createWatchController } from "../src/core/serve.js";
import { fileExists, readText } from "../src/lib/io.js";
import { memDir, todosPath, journalDir } from "../src/lib/paths.js";

function makeReq({ method = "GET", url = "/", headers = {}, bodyObj = null, bodyText = null } = {}) {
  let chunks = [];
  if (bodyText !== null) chunks = [Buffer.from(String(bodyText))];
  else if (bodyObj !== null) chunks = [Buffer.from(JSON.stringify(bodyObj))];
  const req = Readable.from(chunks);
  req.method = method;
  req.url = url;
  req.headers = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return req;
}

function makeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    chunks: [],
    ended: false,
    setHeader(k, v) {
      this.headers[String(k).toLowerCase()] = String(v);
    },
    writeHead(code, headers = {}) {
      this.statusCode = code;
      for (const [k, v] of Object.entries(headers)) this.setHeader(k, v);
    },
    write(buf) {
      this.chunks.push(Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf)));
    },
    end(buf = "") {
      if (buf) this.write(buf);
      this.ended = true;
    }
  };
  return res;
}

async function run(handler, reqOpts) {
  const req = makeReq(reqOpts);
  const res = makeRes();
  await handler(req, res);
  const body = Buffer.concat(res.chunks).toString("utf8");
  return { status: res.statusCode, headers: res.headers, body };
}

async function waitFor(fn, { timeoutMs = 3000, intervalMs = 40 } = {}) {
  const start = Date.now();
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await fn();
    if (ok) return;
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timeout");
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

test("serve handler: /health and /ui are always unauthenticated", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-serve-"));
  const events = createEventsBus();
  const handler = createServeHandler(root, { host: "127.0.0.1", port: 7357, token: "t", events });

  const h = await run(handler, { method: "GET", url: "/health" });
  assert.equal(h.status, 200);
  assert.ok(h.body.includes("\"ok\": true"));

  const ui = await run(handler, { method: "GET", url: "/ui" });
  assert.equal(ui.status, 200);
  assert.ok((ui.headers["content-type"] || "").includes("text/html"));
  assert.ok(ui.body.includes("Quick Write"));
});

test("serve handler: token gates all non-UI endpoints when configured", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-serve-"));
  await fs.mkdir(memDir(root), { recursive: true });
  await fs.writeFile(todosPath(root), "# Todos\n\n## Next\n- A\n\n## Blockers\n- B\n", "utf8");

  const events = createEventsBus();
  const handler = createServeHandler(root, { host: "127.0.0.1", port: 7357, token: "t", allowWrite: true, events });

  const noAuth = await run(handler, { method: "GET", url: "/todos?format=md" });
  assert.equal(noAuth.status, 401);

  const wrongAuth = await run(handler, { method: "GET", url: "/todos?format=md", headers: { "x-rmemo-token": "nope" } });
  assert.equal(wrongAuth.status, 401);

  const ok = await run(handler, { method: "GET", url: "/todos?format=md", headers: { "x-rmemo-token": "t" } });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.includes("## Next"));
});

test("serve handler: write endpoints require allowWrite, and validate JSON body", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-serve-"));

  const ro = createServeHandler(root, { host: "127.0.0.1", port: 7357, token: "t", allowWrite: false, events: createEventsBus() });
  const denied = await run(ro, {
    method: "POST",
    url: "/todos/next",
    headers: { "x-rmemo-token": "t" },
    bodyObj: { text: "X" }
  });
  assert.equal(denied.status, 400);
  assert.ok(denied.body.includes("Write not allowed"));

  const rw = createServeHandler(root, { host: "127.0.0.1", port: 7357, token: "t", allowWrite: true, events: createEventsBus() });
  const badJson = await run(rw, {
    method: "POST",
    url: "/todos/next",
    headers: { "x-rmemo-token": "t", "content-type": "application/json" },
    bodyText: "{not json"
  });
  assert.equal(badJson.status, 400);
  assert.ok(badJson.body.includes("Invalid JSON body"));
});

test("serve handler: todos + log write endpoints mutate repo memory", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-serve-"));
  const handler = createServeHandler(root, { host: "127.0.0.1", port: 7357, token: "t", allowWrite: true, events: createEventsBus() });

  // Add next todo (creates todos.md)
  {
    const r = await run(handler, {
      method: "POST",
      url: "/todos/next",
      headers: { "x-rmemo-token": "t" },
      bodyObj: { text: "Implement workbench actions" }
    });
    assert.equal(r.status, 200);
    assert.ok(await fileExists(todosPath(root)));
    const s = await readText(todosPath(root));
    assert.ok(s.includes("- Implement workbench actions"));
    assert.ok(!s.includes("(Write the next concrete step)"));
  }

  // Add blockers todo
  {
    const r = await run(handler, {
      method: "POST",
      url: "/todos/blockers",
      headers: { "x-rmemo-token": "t" },
      bodyObj: { text: "Need npm provenance decision" }
    });
    assert.equal(r.status, 200);
    const s = await readText(todosPath(root));
    assert.ok(s.includes("- Need npm provenance decision"));
    assert.ok(!s.includes("(If any)"));
  }

  // Remove first next todo
  {
    await run(handler, {
      method: "POST",
      url: "/todos/next",
      headers: { "x-rmemo-token": "t" },
      bodyObj: { text: "Second item" }
    });
    const r = await run(handler, {
      method: "POST",
      url: "/todos/next/done",
      headers: { "x-rmemo-token": "t" },
      bodyObj: { index: 1 }
    });
    assert.equal(r.status, 200);
    const s = await readText(todosPath(root));
    assert.ok(!s.includes("Implement workbench actions"));
    assert.ok(s.includes("- Second item"));
  }

  // Append journal entry
  {
    const r = await run(handler, {
      method: "POST",
      url: "/log",
      headers: { "x-rmemo-token": "t" },
      bodyObj: { kind: "Note", text: "Added serve workbench write endpoints." }
    });
    assert.equal(r.status, 200);

    const dir = journalDir(root);
    assert.ok(await fileExists(dir));
    const files = (await fs.readdir(dir)).filter((x) => x.endsWith(".md"));
    assert.ok(files.length >= 1);
    const s = await readText(path.join(dir, files[0]));
    assert.ok(s.includes("##"));
    assert.ok(s.includes("Note"));
    assert.ok(s.includes("Added serve workbench write endpoints."));
  }
});

test("serve handler: /events returns SSE stream (requires token if set)", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-serve-"));
  const events = createEventsBus();
  events.emit({ type: "refresh:ok", reason: "test" });
  const handler = createServeHandler(root, { host: "127.0.0.1", port: 7357, token: "t", events });

  const unauth = await run(handler, { method: "GET", url: "/events" });
  assert.equal(unauth.status, 401);

  const authed = await run(handler, { method: "GET", url: "/events?token=t" });
  assert.equal(authed.status, 200);
  assert.ok((authed.headers["content-type"] || "").includes("text/event-stream"));
  assert.ok(authed.body.includes("event: hello"));
  assert.ok(authed.body.includes("refresh:ok"));
});

test("serve handler: /events/export supports json and md", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-serve-"));
  const events = createEventsBus();
  events.emit({ type: "refresh:start", reason: "test" });
  events.emit({ type: "refresh:ok", reason: "test", durationMs: 12, stats: { fileCount: 3 } });
  const handler = createServeHandler(root, { host: "127.0.0.1", port: 7357, token: "t", events });

  const jsonExport = await run(handler, { method: "GET", url: "/events/export?format=json&limit=10&token=t" });
  assert.equal(jsonExport.status, 200);
  assert.ok(jsonExport.body.includes("\"events\""));
  assert.ok(jsonExport.body.includes("\"refresh:ok\""));

  const mdExport = await run(handler, { method: "GET", url: "/events/export?format=md&limit=10&token=t" });
  assert.equal(mdExport.status, 200);
  assert.ok(mdExport.body.includes("# Events"));
  assert.ok(mdExport.body.includes("refresh:ok"));
});

test("serve handler: /diagnostics/export supports json and md", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-serve-"));
  await fs.writeFile(path.join(root, "README.md"), "# Demo\n", "utf8");
  const events = createEventsBus();
  events.emit({ type: "refresh:ok", reason: "test", durationMs: 33, stats: { fileCount: 5 } });
  const watchState = {
    enabled: true,
    intervalMs: 2000,
    sync: true,
    embed: false,
    lastOkAt: new Date().toISOString(),
    lastErrAt: null,
    lastErr: null,
    lastRefresh: { durationMs: 33, stats: { fileCount: 5 } }
  };
  const handler = createServeHandler(root, { host: "127.0.0.1", port: 7357, token: "t", events, watchState });

  const jsonDiag = await run(handler, { method: "GET", url: "/diagnostics/export?format=json&token=t" });
  assert.equal(jsonDiag.status, 200);
  assert.ok(jsonDiag.body.includes("\"watch\""));
  assert.ok(jsonDiag.body.includes("\"status\""));
  assert.ok(jsonDiag.body.includes("\"events\""));

  const mdDiag = await run(handler, { method: "GET", url: "/diagnostics/export?format=md&token=t" });
  assert.equal(mdDiag.status, 200);
  assert.ok(mdDiag.body.includes("# Diagnostics"));
  assert.ok(mdDiag.body.includes("## Watch"));
  assert.ok(mdDiag.body.includes("## Events"));
});

test("serve handler: /embed/status /embed/plan and /embed/build work", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-serve-"));
  await fs.writeFile(path.join(root, "README.md"), "# Demo\n", "utf8");
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "index.js"), "console.log('hi')\n", "utf8");

  const ro = createServeHandler(root, { host: "127.0.0.1", port: 7357, token: "t", allowWrite: false, events: createEventsBus() });
  const s0 = await run(ro, { method: "GET", url: "/embed/status?format=json&token=t" });
  assert.equal(s0.status, 200);
  assert.ok(s0.body.includes("\"status\""));

  const p0 = await run(ro, { method: "GET", url: "/embed/plan?format=json&parallelism=3&batchDelayMs=25&token=t" });
  assert.equal(p0.status, 200);
  assert.ok(p0.body.includes("\"summary\""));
  assert.ok(p0.body.includes("\"runtime\""));

  const denied = await run(ro, { method: "POST", url: "/embed/build?token=t", bodyObj: {} });
  assert.equal(denied.status, 400);
  assert.ok(denied.body.includes("Write not allowed"));

  const rw = createServeHandler(root, { host: "127.0.0.1", port: 7357, token: "t", allowWrite: true, events: createEventsBus() });
  const b = await run(rw, {
    method: "POST",
    url: "/embed/build?token=t",
    bodyObj: { provider: "mock", dim: 32, parallelism: 2, kinds: ["rules", "todos", "context"], recentDays: 7 }
  });
  assert.equal(b.status, 200);
  assert.ok(b.body.includes("\"meta\""));
  assert.ok(b.body.includes("\"parallelism\": 2"));

  const s1 = await run(rw, { method: "GET", url: "/embed/status?format=json&token=t" });
  assert.equal(s1.status, 200);
  assert.ok(s1.body.includes("\"index\""));
  assert.ok(s1.body.includes("\"itemCount\""));

  const smd = await run(rw, { method: "GET", url: "/embed/status?format=md&token=t" });
  assert.equal(smd.status, 200);
  assert.ok(smd.body.includes("# Embeddings Status"));

  const pmd = await run(rw, { method: "GET", url: "/embed/plan?format=md&token=t" });
  assert.equal(pmd.status, 200);
  assert.ok(pmd.body.includes("# Embeddings Build Plan"));
});

test("serve handler: /embed/jobs enqueue/list/get/cancel", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-serve-"));
  await fs.writeFile(path.join(root, "README.md"), "# Demo\n", "utf8");
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "index.js"), "console.log('hi')\n", "utf8");

  const events = createEventsBus();
  const handler = createServeHandler(root, { host: "127.0.0.1", port: 7357, token: "t", allowWrite: true, events });

  const before = await run(handler, { method: "GET", url: "/embed/jobs?token=t" });
  assert.equal(before.status, 200);
  assert.ok(before.body.includes("\"queued\""));

  const cfg0 = await run(handler, { method: "GET", url: "/embed/jobs/config?token=t" });
  assert.equal(cfg0.status, 200);
  assert.ok(cfg0.body.includes("\"maxConcurrent\""));
  assert.ok(cfg0.body.includes("\"retryTemplate\""));

  const cfgSet = await run(handler, {
    method: "POST",
    url: "/embed/jobs/config?token=t",
    bodyObj: { maxConcurrent: 2, retryTemplate: "aggressive", defaultPriority: "high" }
  });
  assert.equal(cfgSet.status, 200);
  assert.ok(cfgSet.body.includes("\"maxConcurrent\": 2"));
  assert.ok(cfgSet.body.includes("\"retryTemplate\": \"aggressive\""));

  const cfgBad = await run(handler, { method: "POST", url: "/embed/jobs/config?token=t", bodyObj: { maxConcurrent: 99 } });
  assert.equal(cfgBad.status, 400);

  const enq = await run(handler, {
    method: "POST",
    url: "/embed/jobs?token=t",
    bodyObj: {
      provider: "mock",
      dim: 32,
      kinds: ["rules", "todos", "context"],
      recentDays: 7,
      parallelism: 2,
      priority: "high",
      maxRetries: 2,
      retryDelayMs: 50
    }
  });
  assert.equal(enq.status, 200);
  const enqJson = JSON.parse(enq.body);
  assert.equal(enqJson.ok, true);
  assert.ok(enqJson.job && enqJson.job.id);
  assert.equal(enqJson.job.priority, "high");
  assert.equal(enqJson.job.maxRetries, 2);
  const jobId = enqJson.job.id;

  await waitFor(async () => {
    const s = await run(handler, { method: "GET", url: "/embed/jobs?token=t" });
    const j = JSON.parse(s.body);
    return (
      (j.active && j.active.id === jobId && (j.active.status === "running" || j.active.status === "queued")) ||
      Array.isArray(j.history) && j.history.some((x) => x.id === jobId)
    );
  });

  const one = await run(handler, { method: "GET", url: `/embed/jobs/${encodeURIComponent(jobId)}?token=t` });
  assert.equal(one.status, 200);
  assert.ok(one.body.includes(jobId));

  const missingCancel = await run(handler, { method: "POST", url: "/embed/jobs/does-not-exist/cancel?token=t", bodyObj: {} });
  assert.equal(missingCancel.status, 404);

  const bad = await run(handler, {
    method: "POST",
    url: "/embed/jobs?token=t",
    bodyObj: {
      provider: "not-supported-provider",
      dim: 32,
      priority: "low",
      retryTemplate: "conservative"
    }
  });
  assert.equal(bad.status, 200);
  const badJobId = JSON.parse(bad.body).job.id;

  await waitFor(async () => {
    const s = await run(handler, { method: "GET", url: "/embed/jobs?token=t" });
    const j = JSON.parse(s.body);
    return Array.isArray(j.history) && j.history.some((x) => x.id === badJobId && x.status === "error");
  });

  const oneRetry = await run(handler, { method: "POST", url: `/embed/jobs/${encodeURIComponent(badJobId)}/retry?token=t`, bodyObj: { priority: "high" } });
  assert.equal(oneRetry.status, 200);
  assert.ok(oneRetry.body.includes("\"ok\": true"));

  const failures = await run(handler, { method: "GET", url: "/embed/jobs/failures?token=t&limit=10" });
  assert.equal(failures.status, 200);
  assert.ok(failures.body.includes("\"failures\""));

  const retryFailed = await run(handler, {
    method: "POST",
    url: "/embed/jobs/retry-failed?token=t",
    bodyObj: { limit: 2, errorClass: "config", retryTemplate: "balanced" }
  });
  assert.equal(retryFailed.status, 200);
  assert.ok(retryFailed.body.includes("\"retried\""));

  const gov0 = await run(handler, { method: "GET", url: "/embed/jobs/governance?token=t" });
  assert.equal(gov0.status, 200);
  assert.ok(gov0.body.includes("\"recommendations\""));

  const govSet = await run(handler, {
    method: "POST",
    url: "/embed/jobs/governance/config?token=t",
    bodyObj: {
      governanceEnabled: true,
      governanceWindow: 10,
      governanceFailureRateHigh: 0.4
    }
  });
  assert.equal(govSet.status, 200);
  assert.ok(govSet.body.includes("\"governanceEnabled\": true"));

  const govHist = await run(handler, { method: "GET", url: "/embed/jobs/governance/history?token=t&limit=10" });
  assert.equal(govHist.status, 200);
  const govHistJson = JSON.parse(govHist.body);
  assert.equal(govHistJson.ok, true);
  assert.ok(Array.isArray(govHistJson.versions));
  assert.ok(govHistJson.versions.length >= 1);

  const govApply = await run(handler, {
    method: "POST",
    url: "/embed/jobs/governance/apply?token=t",
    bodyObj: { source: "test" }
  });
  // depending on recommendation availability, may be 200 (applied) or 400 (no recommendation).
  assert.ok(govApply.status === 200 || govApply.status === 400);

  const rollback = await run(handler, {
    method: "POST",
    url: "/embed/jobs/governance/rollback?token=t",
    bodyObj: { versionId: govHistJson.versions[0].id, source: "test" }
  });
  assert.equal(rollback.status, 200);
  assert.ok(rollback.body.includes("\"versionId\""));
});

test("serve handler: POST /refresh triggers refreshRepoMemory (requires allowWrite + token)", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-serve-"));
  await fs.writeFile(path.join(root, "README.md"), "# Demo\n", "utf8");
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "index.js"), "console.log('hi')\n", "utf8");

  const events = createEventsBus();
  const watchState = { enabled: false, intervalMs: 2000, sync: true, embed: false, lastOkAt: null, lastErrAt: null, lastErr: null, lastRefresh: null };
  const ro = createServeHandler(root, { host: "127.0.0.1", port: 7357, token: "t", allowWrite: false, events });
  const denied = await run(ro, { method: "POST", url: "/refresh?token=t", bodyObj: {} });
  assert.equal(denied.status, 400);

  const rw = createServeHandler(root, { host: "127.0.0.1", port: 7357, token: "t", allowWrite: true, events, watchState });
  const r = await run(rw, { method: "POST", url: "/refresh?token=t", bodyObj: { sync: false, embed: false } });
  assert.equal(r.status, 200);
  assert.ok(await fileExists(path.join(root, ".repo-memory", "context.md")));
  assert.ok(await fileExists(path.join(root, ".repo-memory", "manifest.json")));
  assert.ok(await fileExists(path.join(root, ".repo-memory", "index.json")));

  const w = await run(rw, { method: "GET", url: "/watch?token=t" });
  assert.equal(w.status, 200);
  assert.ok(w.body.includes("\"lastRefresh\""));
  assert.ok(w.body.includes("\"durationMs\""));
});

test("serve handler: POST /watch/start and /watch/stop control watch state", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-serve-"));
  await fs.writeFile(path.join(root, "README.md"), "# Demo\n", "utf8");

  const events = createEventsBus();
  const watchState = { enabled: false, intervalMs: 2000, sync: true, embed: false, lastOkAt: null, lastErrAt: null, lastErr: null, lastRefresh: null };
  const watchCtl = createWatchController(root, { events, watchState });

  const handler = createServeHandler(root, {
    host: "127.0.0.1",
    port: 7357,
    token: "t",
    allowWrite: true,
    events,
    watchState,
    getWatchCtl: () => watchCtl
  });

  const s0 = await run(handler, { method: "GET", url: "/watch?token=t" });
  assert.equal(s0.status, 200);
  assert.ok(s0.body.includes("\"enabled\": false"));

  const start = await run(handler, { method: "POST", url: "/watch/start?token=t", bodyObj: { intervalMs: 200, sync: false, embed: false } });
  assert.equal(start.status, 200);

  const s1 = await run(handler, { method: "GET", url: "/watch?token=t" });
  assert.equal(s1.status, 200);
  assert.ok(s1.body.includes("\"enabled\": true"));

  const stop = await run(handler, { method: "POST", url: "/watch/stop?token=t", bodyObj: {} });
  assert.equal(stop.status, 200);

  const s2 = await run(handler, { method: "GET", url: "/watch?token=t" });
  assert.equal(s2.status, 200);
  assert.ok(s2.body.includes("\"enabled\": false"));
});
