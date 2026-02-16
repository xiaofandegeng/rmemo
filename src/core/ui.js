function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderUiHtml({ title = "rmemo", apiBasePath = "" } = {}) {
  // Single-file UI: no external assets, no build step.
  const t = escHtml(title);
  const base = String(apiBasePath || "");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${t}</title>
    <style>
      :root {
        --bg: #0b0f14;
        --panel: #0f1620;
        --text: #e6edf3;
        --muted: #94a3b8;
        --border: rgba(148, 163, 184, 0.18);
        --accent: #22c55e;
        --warn: #f59e0b;
        --danger: #ef4444;
        --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        --sans: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
      }
      body {
        margin: 0;
        background: radial-gradient(1000px 600px at 20% -10%, rgba(34,197,94,0.18), transparent 60%),
          radial-gradient(900px 600px at 100% 20%, rgba(59,130,246,0.12), transparent 55%),
          var(--bg);
        color: var(--text);
        font-family: var(--sans);
      }
      .wrap { max-width: 1100px; margin: 28px auto; padding: 0 16px 60px; }
      header { display: flex; gap: 16px; align-items: baseline; justify-content: space-between; }
      h1 { font-size: 22px; margin: 0; letter-spacing: 0.2px; }
      .sub { color: var(--muted); font-size: 13px; }
      .grid { display: grid; grid-template-columns: 360px 1fr; gap: 14px; margin-top: 14px; }
      @media (max-width: 960px) { .grid { grid-template-columns: 1fr; } }
      .grid2 { display: grid; grid-template-columns: 1fr; gap: 12px; }
      .panel { background: color-mix(in srgb, var(--panel) 92%, transparent); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
      .ph { padding: 12px 12px 10px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .ph strong { font-size: 13px; letter-spacing: 0.25px; text-transform: uppercase; color: rgba(230,237,243,0.86); }
      .pb { padding: 12px; }
      .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      label { font-size: 12px; color: var(--muted); }
      input[type="text"], input[type="password"], select {
        background: rgba(255,255,255,0.04);
        border: 1px solid var(--border);
        color: var(--text);
        padding: 8px 10px;
        border-radius: 10px;
        outline: none;
        font-family: var(--sans);
      }
      input[type="text"], input[type="password"] { width: 100%; }
      .btn {
        background: rgba(34,197,94,0.12);
        border: 1px solid rgba(34,197,94,0.35);
        color: var(--text);
        padding: 8px 10px;
        border-radius: 10px;
        cursor: pointer;
        font-size: 13px;
      }
      .btn.secondary { background: rgba(148,163,184,0.08); border-color: rgba(148,163,184,0.22); }
      .btn.danger { background: rgba(239,68,68,0.10); border-color: rgba(239,68,68,0.30); }
      .btn:active { transform: translateY(1px); }
      .tabs { display: flex; gap: 8px; flex-wrap: wrap; }
      .tab { padding: 8px 10px; border-radius: 10px; border: 1px solid var(--border); cursor: pointer; color: var(--muted); font-size: 13px; }
      .tab.active { border-color: rgba(34,197,94,0.35); background: rgba(34,197,94,0.08); color: var(--text); }
      pre {
        margin: 0;
        padding: 12px;
        background: rgba(0,0,0,0.30);
        border: 1px solid rgba(148,163,184,0.14);
        border-radius: 12px;
        overflow: auto;
        font-family: var(--mono);
        font-size: 12px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .hint { font-size: 12px; color: var(--muted); margin-top: 8px; }
      .err { color: #fecaca; font-family: var(--mono); font-size: 12px; white-space: pre-wrap; }
      .ok { color: #bbf7d0; font-family: var(--mono); font-size: 12px; }
      .subpanel { border-radius: 12px; background: rgba(0,0,0,0.18); border: 1px solid rgba(148,163,184,0.14); padding: 10px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <div>
          <h1>${t} UI</h1>
          <div class="sub">Local dashboard for repo memory (status, rules, todos, journal, semantic search, focus pack).</div>
        </div>
        <div class="sub" id="base"></div>
      </header>

      <div class="grid">
        <div class="panel">
          <div class="ph"><strong>Controls</strong></div>
          <div class="pb">
            <div class="row">
              <div style="flex: 1; min-width: 220px;">
                <label>Token (optional; stored in localStorage)</label>
                <input id="token" type="password" placeholder="RMEMO_TOKEN (x-rmemo-token header)" />
              </div>
              <button class="btn secondary" id="saveToken">Save</button>
              <button class="btn danger" id="clearToken">Clear</button>
            </div>

            <div style="height: 10px;"></div>

            <div class="grid2">
              <div class="row">
                <button class="btn" id="refreshAll">Refresh</button>
                <button class="btn secondary" id="loadStatus">Status</button>
                <button class="btn secondary" id="loadRules">Rules</button>
                <button class="btn secondary" id="loadTodos">Todos</button>
                <button class="btn secondary" id="loadContext">Context</button>
              </div>

              <div class="row">
                <button class="btn secondary" id="startEvents">Events On</button>
                <button class="btn secondary" id="stopEvents">Events Off</button>
                <div class="hint" id="eventsState" style="margin: 0;">events: off</div>
              </div>

              <div class="subpanel">
                <div class="row" style="justify-content: space-between;">
                  <label style="margin: 0;">Live</label>
                  <span class="hint" style="margin: 0;">from <span style="font-family: var(--mono)">GET /events</span></span>
                </div>
                <div style="height: 8px;"></div>
                <div class="row">
                  <button class="btn secondary" id="exportEventsJson">Export JSON</button>
                  <button class="btn secondary" id="exportEventsMd">Export MD</button>
                  <button class="btn secondary" id="exportDiagJson">Diag JSON</button>
                  <button class="btn secondary" id="exportDiagMd">Diag MD</button>
                </div>
                <div style="height: 8px;"></div>
                <pre id="live" style="max-height: 160px;"></pre>
              </div>

              <div class="subpanel">
                <div class="row" style="justify-content: space-between;">
                  <label style="margin: 0;">Watch</label>
                  <span class="hint" style="margin: 0;">from <span style="font-family: var(--mono)">GET /watch</span></span>
                </div>
                <div style="height: 8px;"></div>
                <div class="row">
                  <button class="btn secondary" id="loadWatch">Load</button>
                  <button class="btn secondary" id="startWatch">Start</button>
                  <button class="btn secondary" id="stopWatch">Stop</button>
                </div>
                <div style="height: 8px;"></div>
                <div class="row">
                  <input id="watchInterval" type="text" placeholder="interval ms" style="width: 140px;" />
                  <label style="display:flex; gap:6px; align-items:center;">
                    <input id="watchSync" type="checkbox" checked />
                    <span class="hint" style="margin:0;">sync</span>
                  </label>
                  <label style="display:flex; gap:6px; align-items:center;">
                    <input id="watchEmbed" type="checkbox" />
                    <span class="hint" style="margin:0;">embed</span>
                  </label>
                </div>
                <div class="hint">Start/Stop requires <span style="font-family: var(--mono)">rmemo serve --allow-write</span>.</div>
                <pre id="watchOut" style="max-height: 160px;"></pre>
              </div>

              <div class="panel" style="border-radius: 12px;">
                <div class="ph"><strong>Quick Write</strong></div>
                <div class="pb">
                  <div class="hint">Requires server started with <span style="font-family: var(--mono)">rmemo serve --allow-write --token ...</span>.</div>
                  <div style="height: 10px;"></div>

                  <label>Add todo</label>
                  <div class="row">
                    <select id="todoKind">
                      <option value="next" selected>next</option>
                      <option value="blockers">blockers</option>
                    </select>
                    <div style="flex: 1; min-width: 220px;">
                      <input id="todoText" type="text" placeholder="e.g. Implement token refresh debounce" />
                    </div>
                    <button class="btn secondary" id="addTodo">Add</button>
                  </div>

                  <div style="height: 8px;"></div>

                  <label>Mark done / unblock</label>
                  <div class="row">
                    <select id="todoRmKind">
                      <option value="next_done" selected>next done</option>
                      <option value="blockers_unblock">blockers unblock</option>
                    </select>
                    <input id="todoIndex" type="text" placeholder="index (1..n)" style="width: 140px;" />
                    <button class="btn secondary" id="rmTodo">Apply</button>
                  </div>

                  <div style="height: 10px;"></div>

                  <label>Log (journal)</label>
                  <div class="row">
                    <input id="logText" type="text" placeholder="e.g. Fixed auth token validation; next: add tests" />
                    <button class="btn secondary" id="addLog">Log</button>
                  </div>

                  <div style="height: 10px;"></div>
                  <div class="row">
                    <button class="btn secondary" id="doSync">Sync</button>
                    <button class="btn secondary" id="doEmbedAuto">Embed Auto</button>
                    <button class="btn secondary" id="loadEmbedStatus">Embed Status</button>
                    <button class="btn secondary" id="loadEmbedPlan">Embed Plan</button>
                    <button class="btn secondary" id="doEmbedBuild">Embed Build</button>
                    <button class="btn secondary" id="enqueueEmbedJob">Enqueue Job</button>
                    <button class="btn secondary" id="loadEmbedJobs">Jobs</button>
                  </div>
                  <div style="height: 8px;"></div>
                  <div class="row">
                    <input id="embedParallelism" type="text" placeholder="parallelism (mock)" style="width: 180px;" />
                    <input id="embedBatchDelayMs" type="text" placeholder="batchDelayMs (openai)" style="width: 200px;" />
                    <input id="embedPriority" type="text" placeholder="priority low|normal|high" style="width: 200px;" />
                    <input id="embedRetryTemplate" type="text" placeholder="retryTemplate conservative|balanced|aggressive" style="width: 280px;" />
                    <input id="embedMaxRetries" type="text" placeholder="maxRetries" style="width: 120px;" />
                    <input id="embedRetryDelayMs" type="text" placeholder="retryDelayMs" style="width: 140px;" />
                  </div>
                  <div style="height: 8px;"></div>
                  <div class="row">
                    <input id="embedJobsMaxConcurrent" type="text" placeholder="jobs maxConcurrent (1-8)" style="width: 220px;" />
                    <button class="btn secondary" id="loadEmbedJobsConfig">Jobs Config</button>
                    <button class="btn secondary" id="saveEmbedJobsConfig">Save Jobs Config</button>
                    <input id="cancelEmbedJobId" type="text" placeholder="cancel job id" style="width: 220px;" />
                    <button class="btn secondary" id="cancelEmbedJob">Cancel Job</button>
                  </div>
                  <div style="height: 8px;"></div>
                  <div class="row">
                    <input id="retryEmbedJobId" type="text" placeholder="retry source job id" style="width: 220px;" />
                    <button class="btn secondary" id="retryEmbedJob">Retry Job</button>
                    <input id="retryFailedLimit" type="text" placeholder="retry failed limit" style="width: 140px;" />
                    <input id="embedFailureClass" type="text" placeholder="errorClass filter" style="width: 180px;" />
                    <button class="btn secondary" id="loadEmbedFailures">Failures</button>
                    <button class="btn secondary" id="retryFailedEmbedJobs">Retry Failed</button>
                  </div>
                  <div style="height: 8px;"></div>
                  <div class="row">
                    <input id="embedClusterKey" type="text" placeholder="clusterKey filter (optional)" style="min-width: 280px; flex: 1;" />
                  </div>
                  <div style="height: 8px;"></div>
                  <div class="row">
                    <label style="display:flex; gap:6px; align-items:center;">
                      <input id="govEnabled" type="checkbox" />
                      <span class="hint" style="margin:0;">governance enabled</span>
                    </label>
                    <input id="govWindow" type="text" placeholder="gov window (jobs)" style="width: 180px;" />
                    <input id="govFailureRateHigh" type="text" placeholder="gov failure threshold (0~1)" style="width: 220px;" />
                    <button class="btn secondary" id="loadEmbedGovernance">Governance</button>
                    <button class="btn secondary" id="saveEmbedGovernance">Save Governance</button>
                    <button class="btn secondary" id="applyEmbedGovernance">Apply Top Suggestion</button>
                  </div>

                  <div style="height: 10px;"></div>

                  <label>Refresh repo memory</label>
                  <div class="row">
                    <label style="display:flex; gap:6px; align-items:center;">
                      <input id="refreshSync" type="checkbox" checked />
                      <span class="hint" style="margin:0;">sync</span>
                    </label>
                    <label style="display:flex; gap:6px; align-items:center;">
                      <input id="refreshEmbed" type="checkbox" />
                      <span class="hint" style="margin:0;">embed</span>
                    </label>
                    <button class="btn secondary" id="doRefreshRepo">Refresh Now</button>
                  </div>
                </div>
              </div>
            </div>

            <div style="height: 12px;"></div>

            <div>
              <label>Search / Focus</label>
              <div class="row">
                <input id="q" type="text" placeholder="Ask a question (e.g. auth token refresh)" />
              </div>
              <div style="height: 8px;"></div>
              <div class="row">
                <select id="mode">
                  <option value="semantic" selected>semantic</option>
                  <option value="keyword">keyword</option>
                </select>
                <button class="btn secondary" id="doSearch">Search</button>
                <button class="btn" id="doFocus">Focus Pack</button>
              </div>
              <div class="hint">Semantic mode requires embeddings. Run: <span style="font-family: var(--mono)">rmemo embed build</span> (or enable embed in config).</div>
            </div>

            <div style="height: 12px;"></div>
            <div id="msg" class="hint"></div>
            <div id="err" class="err"></div>
          </div>
        </div>

        <div class="panel">
          <div class="ph">
            <strong id="title">Output</strong>
            <div class="tabs" id="tabs">
              <div class="tab active" data-tab="md">Markdown/Text</div>
              <div class="tab" data-tab="json">JSON</div>
            </div>
          </div>
          <div class="pb">
            <pre id="out"></pre>
          </div>
        </div>
      </div>
    </div>

    <script>
      const API_BASE = ${JSON.stringify(base)};
      const qs = (s) => document.querySelector(s);
      const msg = (s) => (qs("#msg").textContent = s || "");
      const err = (s) => (qs("#err").textContent = s || "");
      const out = (s) => (qs("#out").textContent = s || "");
      const live = (s) => (qs("#live").textContent = s || "");
      const liveLines = [];
      function pushLive(obj) {
        const s = typeof obj === "string" ? obj : JSON.stringify(obj);
        liveLines.push(s);
        while (liveLines.length > 60) liveLines.shift();
        live(liveLines.join("\n"));
      }

      function setTab(name) {
        for (const el of document.querySelectorAll(".tab")) {
          el.classList.toggle("active", el.dataset.tab === name);
        }
        qs("#out").dataset.tab = name;
      }

      async function apiFetch(path, { accept = "text/plain", json = false } = {}) {
        const token = (qs("#token").value || "").trim();
        const headers = { "accept": accept };
        if (token) headers["x-rmemo-token"] = token;
        const r = await fetch(API_BASE + path, { headers });
        if (!r.ok) {
          const t = await r.text().catch(() => "");
          throw new Error("HTTP " + r.status + " " + r.statusText + (t ? ("\\n" + t.slice(0, 800)) : ""));
        }
        return json ? await r.json() : await r.text();
      }

      async function apiPost(path, bodyObj) {
        const token = (qs("#token").value || "").trim();
        const headers = { "content-type": "application/json", "accept": "application/json" };
        if (token) headers["x-rmemo-token"] = token;
        const r = await fetch(API_BASE + path, { method: "POST", headers, body: JSON.stringify(bodyObj || {}) });
        const t = await r.text().catch(() => "");
        if (!r.ok) {
          throw new Error("HTTP " + r.status + " " + r.statusText + (t ? ("\\n" + t.slice(0, 800)) : ""));
        }
        try { return JSON.parse(t); } catch { return { ok: true, raw: t }; }
      }

      function loadToken() {
        const t = localStorage.getItem("rmemo_token") || "";
        qs("#token").value = t;
      }
      function saveToken() {
        localStorage.setItem("rmemo_token", (qs("#token").value || "").trim());
        msg("Token saved.");
      }
      function clearToken() {
        localStorage.removeItem("rmemo_token");
        qs("#token").value = "";
        msg("Token cleared.");
      }

      async function loadStatus() {
        err(""); msg("Loading status...");
        const tab = qs("#out").dataset.tab || "md";
        if (tab === "json") {
          const j = await apiFetch("/status?format=json", { accept: "application/json", json: true });
          out(JSON.stringify(j, null, 2));
        } else {
          const t = await apiFetch("/status?format=md&mode=full", { accept: "text/markdown" });
          out(t);
        }
        msg("OK");
        qs("#title").textContent = "Status";
      }
      async function loadRules() {
        err(""); msg("Loading rules...");
        const t = await apiFetch("/rules", { accept: "text/markdown" });
        out(t);
        msg("OK");
        qs("#title").textContent = "Rules";
      }
      async function loadTodos() {
        err(""); msg("Loading todos...");
        const tab = qs("#out").dataset.tab || "md";
        if (tab === "json") {
          const t = await apiFetch("/todos?format=json", { accept: "application/json" });
          out(t);
        } else {
          const t = await apiFetch("/todos?format=md", { accept: "text/markdown" });
          out(t);
        }
        msg("OK");
        qs("#title").textContent = "Todos";
      }
      async function loadContext() {
        err(""); msg("Loading context...");
        const t = await apiFetch("/context", { accept: "text/markdown" });
        out(t);
        msg("OK");
        qs("#title").textContent = "Context";
      }

      async function loadWatch() {
        try {
          const j = await apiFetch("/watch", { accept: "application/json", json: true });
          qs("#watchOut").textContent = JSON.stringify(j, null, 2);
        } catch (e) {
          qs("#watchOut").textContent = String(e);
        }
      }

      async function exportEvents(format) {
        err(""); msg("Exporting events...");
        const p = "/events/export?format=" + encodeURIComponent(format) + "&limit=200";
        if (format === "json") {
          const j = await apiFetch(p, { accept: "application/json", json: true });
          out(JSON.stringify(j, null, 2));
          setTab("json");
        } else {
          const t = await apiFetch(p, { accept: "text/markdown" });
          out(t);
          setTab("md");
        }
        qs("#title").textContent = "Events Export";
        msg("OK");
      }

      async function exportDiagnostics(format) {
        err(""); msg("Exporting diagnostics...");
        const p = "/diagnostics/export?format=" + encodeURIComponent(format) + "&limitEvents=200";
        if (format === "json") {
          const j = await apiFetch(p, { accept: "application/json", json: true });
          out(JSON.stringify(j, null, 2));
          setTab("json");
        } else {
          const t = await apiFetch(p, { accept: "text/markdown" });
          out(t);
          setTab("md");
        }
        qs("#title").textContent = "Diagnostics Export";
        msg("OK");
      }
      async function doSearch() {
        err(""); msg("Searching...");
        const q = (qs("#q").value || "").trim();
        const mode = qs("#mode").value;
        if (!q) return msg("Missing query.");
        const tab = qs("#out").dataset.tab || "md";
        if (mode === "semantic") {
          const j = await apiFetch("/search?mode=semantic&q=" + encodeURIComponent(q), { accept: "application/json", json: true });
          out(JSON.stringify(j, null, 2));
          setTab("json");
        } else {
          const j = await apiFetch("/search?mode=keyword&q=" + encodeURIComponent(q) + "&maxHits=50", { accept: "application/json", json: true });
          out(JSON.stringify(j, null, 2));
          setTab("json");
        }
        msg("OK");
        qs("#title").textContent = "Search";
      }
      async function doFocus() {
        err(""); msg("Generating focus pack...");
        const q = (qs("#q").value || "").trim();
        const mode = qs("#mode").value;
        if (!q) return msg("Missing query.");
        const tab = qs("#out").dataset.tab || "md";
        const fmt = tab === "json" ? "json" : "md";
        const t = await apiFetch("/focus?q=" + encodeURIComponent(q) + "&mode=" + encodeURIComponent(mode) + "&format=" + fmt, {
          accept: fmt === "json" ? "application/json" : "text/markdown"
        });
        out(t);
        msg("OK");
        qs("#title").textContent = "Focus Pack";
      }

      async function addTodo() {
        err(""); msg("Adding todo...");
        const kind = qs("#todoKind").value;
        const text = (qs("#todoText").value || "").trim();
        if (!text) return msg("Missing todo text.");
        const p = kind === "blockers" ? "/todos/blockers" : "/todos/next";
        await apiPost(p, { text });
        qs("#todoText").value = "";
        msg("OK");
        await loadTodos();
      }

      async function rmTodo() {
        err(""); msg("Updating todo...");
        const kind = qs("#todoRmKind").value;
        const index = Number((qs("#todoIndex").value || "").trim());
        if (!Number.isFinite(index) || index <= 0) return msg("Invalid index.");
        const p = kind === "blockers_unblock" ? "/todos/blockers/unblock" : "/todos/next/done";
        await apiPost(p, { index });
        qs("#todoIndex").value = "";
        msg("OK");
        await loadTodos();
      }

      async function addLog() {
        err(""); msg("Logging...");
        const text = (qs("#logText").value || "").trim();
        if (!text) return msg("Missing log text.");
        await apiPost("/log", { text, kind: "Log" });
        qs("#logText").value = "";
        msg("OK");
      }

      async function doSync() {
        err(""); msg("Syncing...");
        await apiPost("/sync", {});
        msg("OK");
      }

      async function doEmbedAuto() {
        err(""); msg("Embedding...");
        const j = await apiPost("/embed/auto", {});
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Embed Auto";
      }

      async function loadEmbedStatus() {
        err(""); msg("Loading embedding status...");
        const j = await apiFetch("/embed/status?format=json", { accept: "application/json", json: true });
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Embed Status";
      }

      async function loadEmbedPlan() {
        err(""); msg("Planning embeddings build...");
        const p = Number((qs("#embedParallelism").value || "").trim());
        const d = Number((qs("#embedBatchDelayMs").value || "").trim());
        let path = "/embed/plan?format=json";
        if (Number.isFinite(p) && p > 0) path += "&parallelism=" + encodeURIComponent(String(p));
        if (Number.isFinite(d) && d >= 0) path += "&batchDelayMs=" + encodeURIComponent(String(d));
        const j = await apiFetch(path, { accept: "application/json", json: true });
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Embed Plan";
      }

      async function doEmbedBuild() {
        err(""); msg("Building embeddings...");
        const p = Number((qs("#embedParallelism").value || "").trim());
        const d = Number((qs("#embedBatchDelayMs").value || "").trim());
        const body = {};
        if (Number.isFinite(p) && p > 0) body.parallelism = p;
        if (Number.isFinite(d) && d >= 0) body.batchDelayMs = d;
        const j = await apiPost("/embed/build", body);
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Embed Build";
      }

      async function enqueueEmbedJob() {
        err(""); msg("Enqueueing embed build job...");
        const p = Number((qs("#embedParallelism").value || "").trim());
        const d = Number((qs("#embedBatchDelayMs").value || "").trim());
        const mr = Number((qs("#embedMaxRetries").value || "").trim());
        const rd = Number((qs("#embedRetryDelayMs").value || "").trim());
        const pr = (qs("#embedPriority").value || "").trim().toLowerCase();
        const rt = (qs("#embedRetryTemplate").value || "").trim().toLowerCase();
        const body = {};
        if (Number.isFinite(p) && p > 0) body.parallelism = p;
        if (Number.isFinite(d) && d >= 0) body.batchDelayMs = d;
        if (Number.isFinite(mr) && mr >= 0) body.maxRetries = mr;
        if (Number.isFinite(rd) && rd >= 0) body.retryDelayMs = rd;
        if (pr) body.priority = pr;
        if (rt === "conservative" || rt === "balanced" || rt === "aggressive") body.retryTemplate = rt;
        const j = await apiPost("/embed/jobs", body);
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Embed Job Enqueued";
      }

      async function loadEmbedJobsConfig() {
        err(""); msg("Loading jobs config...");
        const j = await apiFetch("/embed/jobs/config", { accept: "application/json", json: true });
        const n = Number(j && j.config && j.config.maxConcurrent);
        if (Number.isFinite(n) && n > 0) qs("#embedJobsMaxConcurrent").value = String(n);
        const rt = String((j && j.config && j.config.retryTemplate) || "");
        if (rt) qs("#embedRetryTemplate").value = rt;
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Embed Jobs Config";
      }

      async function saveEmbedJobsConfig() {
        err(""); msg("Saving jobs config...");
        const n = Number((qs("#embedJobsMaxConcurrent").value || "").trim());
        if (!Number.isFinite(n) || n < 1) return msg("Invalid maxConcurrent.");
        const retryTemplate = (qs("#embedRetryTemplate").value || "").trim().toLowerCase();
        const body = { maxConcurrent: n };
        if (retryTemplate === "conservative" || retryTemplate === "balanced" || retryTemplate === "aggressive") {
          body.retryTemplate = retryTemplate;
        }
        const j = await apiPost("/embed/jobs/config", body);
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Embed Jobs Config";
      }

      async function loadEmbedJobs() {
        err(""); msg("Loading embed jobs...");
        const j = await apiFetch("/embed/jobs", { accept: "application/json", json: true });
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Embed Jobs";
      }

      async function cancelEmbedJob() {
        err(""); msg("Canceling embed job...");
        const id = (qs("#cancelEmbedJobId").value || "").trim();
        if (!id) return msg("Missing job id.");
        const j = await apiPost("/embed/jobs/" + encodeURIComponent(id) + "/cancel", {});
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Embed Job Cancel";
      }

      async function retryEmbedJob() {
        err(""); msg("Retrying embed job...");
        const id = (qs("#retryEmbedJobId").value || "").trim();
        if (!id) return msg("Missing source job id.");
        const pr = (qs("#embedPriority").value || "").trim().toLowerCase();
        const rt = (qs("#embedRetryTemplate").value || "").trim().toLowerCase();
        const body = {};
        if (pr) body.priority = pr;
        if (rt === "conservative" || rt === "balanced" || rt === "aggressive") body.retryTemplate = rt;
        const j = await apiPost("/embed/jobs/" + encodeURIComponent(id) + "/retry", body);
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Embed Job Retry";
      }

      async function loadEmbedFailures() {
        err(""); msg("Loading embed failures...");
        const limit = Number((qs("#retryFailedLimit").value || "").trim());
        const errorClass = (qs("#embedFailureClass").value || "").trim();
        let path = "/embed/jobs/failures";
        const ps = [];
        if (Number.isFinite(limit) && limit > 0) ps.push("limit=" + encodeURIComponent(String(limit)));
        if (errorClass) ps.push("errorClass=" + encodeURIComponent(errorClass));
        if (ps.length) path += "?" + ps.join("&");
        const j = await apiFetch(path, { accept: "application/json", json: true });
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Embed Failures";
      }

      async function retryFailedEmbedJobs() {
        err(""); msg("Retrying failed embed jobs...");
        const limit = Number((qs("#retryFailedLimit").value || "").trim());
        const errorClass = (qs("#embedFailureClass").value || "").trim();
        const clusterKey = (qs("#embedClusterKey").value || "").trim();
        const pr = (qs("#embedPriority").value || "").trim().toLowerCase();
        const rt = (qs("#embedRetryTemplate").value || "").trim().toLowerCase();
        const body = {};
        if (Number.isFinite(limit) && limit > 0) body.limit = limit;
        if (errorClass) body.errorClass = errorClass;
        if (clusterKey) body.clusterKey = clusterKey;
        if (pr) body.priority = pr;
        if (rt === "conservative" || rt === "balanced" || rt === "aggressive") body.retryTemplate = rt;
        const j = await apiPost("/embed/jobs/retry-failed", body);
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Embed Retry Failed";
      }

      async function loadEmbedGovernance() {
        err(""); msg("Loading governance report...");
        const j = await apiFetch("/embed/jobs/governance", { accept: "application/json", json: true });
        const cfg = (j && j.report && j.report.config) || {};
        if (cfg.governanceEnabled !== undefined) qs("#govEnabled").checked = !!cfg.governanceEnabled;
        if (cfg.governanceWindow !== undefined) qs("#govWindow").value = String(cfg.governanceWindow);
        if (cfg.governanceFailureRateHigh !== undefined) qs("#govFailureRateHigh").value = String(cfg.governanceFailureRateHigh);
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Embed Governance";
      }

      async function saveEmbedGovernance() {
        err(""); msg("Saving governance config...");
        const windowN = Number((qs("#govWindow").value || "").trim());
        const fr = Number((qs("#govFailureRateHigh").value || "").trim());
        const body = {
          governanceEnabled: !!qs("#govEnabled").checked
        };
        if (Number.isFinite(windowN) && windowN > 0) body.governanceWindow = windowN;
        if (Number.isFinite(fr) && fr > 0 && fr <= 1) body.governanceFailureRateHigh = fr;
        const j = await apiPost("/embed/jobs/governance/config", body);
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Embed Governance Config";
      }

      async function applyEmbedGovernance() {
        err(""); msg("Applying top governance recommendation...");
        const j = await apiPost("/embed/jobs/governance/apply", { source: "ui" });
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Embed Governance Apply";
      }

      async function doRefreshRepo() {
        err(""); msg("Refreshing repo memory...");
        const sync = !!qs("#refreshSync").checked;
        const embed = !!qs("#refreshEmbed").checked;
        const j = await apiPost("/refresh", { sync, embed });
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Refresh";
        await loadStatus();
        await loadTodos();
      }

      let evt = null;
      function stopEvents() {
        try { evt && evt.close && evt.close(); } catch {}
        evt = null;
        qs("#eventsState").textContent = "events: off";
      }

      function startEvents() {
        stopEvents();
        const token = (qs("#token").value || "").trim();
        const u = new URL(API_BASE + "/events", location.origin);
        if (token) u.searchParams.set("token", token);
        evt = new EventSource(u.toString());
        qs("#eventsState").textContent = "events: connecting...";
        evt.addEventListener("open", () => {
          qs("#eventsState").textContent = "events: on";
          pushLive({ type: "events:open" });
          loadWatch().catch(() => {});
        });
        evt.addEventListener("error", () => {
          qs("#eventsState").textContent = "events: error";
          pushLive({ type: "events:error" });
        });
        evt.addEventListener("hello", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "hello"); }
        });
        // On watch refresh events, update status to keep UI current.
        evt.addEventListener("refresh:ok", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "refresh:ok"); }
          // Best-effort refresh; don't break UI if token expired.
          loadStatus().catch(() => {});
          loadTodos().catch(() => {});
        });
        evt.addEventListener("refresh:err", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "refresh:err"); }
        });
        evt.addEventListener("watch:starting", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "watch:starting"); }
          loadWatch().catch(() => {});
        });
        evt.addEventListener("watch:stopping", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "watch:stopping"); }
          loadWatch().catch(() => {});
        });
        evt.addEventListener("watch:error", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "watch:error"); }
          loadWatch().catch(() => {});
        });
        evt.addEventListener("embed:build:start", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "embed:build:start"); }
        });
        evt.addEventListener("embed:build:progress", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "embed:build:progress"); }
        });
        evt.addEventListener("embed:build:ok", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "embed:build:ok"); }
        });
        evt.addEventListener("embed:build:err", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "embed:build:err"); }
        });
        evt.addEventListener("embed:job:queued", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "embed:job:queued"); }
        });
        evt.addEventListener("embed:job:start", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "embed:job:start"); }
        });
        evt.addEventListener("embed:job:progress", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "embed:job:progress"); }
        });
        evt.addEventListener("embed:job:retry", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "embed:job:retry"); }
        });
        evt.addEventListener("embed:job:ok", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "embed:job:ok"); }
        });
        evt.addEventListener("embed:job:err", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "embed:job:err"); }
        });
        evt.addEventListener("embed:job:canceled", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "embed:job:canceled"); }
        });
        evt.addEventListener("embed:job:requeued", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "embed:job:requeued"); }
        });
        evt.addEventListener("embed:jobs:retry-failed", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "embed:jobs:retry-failed"); }
        });
        evt.addEventListener("embed:jobs:governance:action", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "embed:jobs:governance:action"); }
          loadEmbedGovernance().catch(() => {});
          loadEmbedJobsConfig().catch(() => {});
        });
        evt.addEventListener("embed:jobs:governance:skip", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "embed:jobs:governance:skip"); }
        });
        evt.addEventListener("embed:jobs:config", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "embed:jobs:config"); }
          loadEmbedJobsConfig().catch(() => {});
        });
      }

      qs("#saveToken").addEventListener("click", saveToken);
      qs("#clearToken").addEventListener("click", clearToken);
      qs("#refreshAll").addEventListener("click", async () => { await loadStatus(); });
      qs("#loadStatus").addEventListener("click", loadStatus);
      qs("#loadRules").addEventListener("click", loadRules);
      qs("#loadTodos").addEventListener("click", loadTodos);
      qs("#loadContext").addEventListener("click", loadContext);
      qs("#doSearch").addEventListener("click", () => doSearch().catch((e) => { err(String(e)); msg(""); }));
      qs("#doFocus").addEventListener("click", () => doFocus().catch((e) => { err(String(e)); msg(""); }));
      qs("#addTodo").addEventListener("click", () => addTodo().catch((e) => { err(String(e)); msg(""); }));
      qs("#rmTodo").addEventListener("click", () => rmTodo().catch((e) => { err(String(e)); msg(""); }));
      qs("#addLog").addEventListener("click", () => addLog().catch((e) => { err(String(e)); msg(""); }));
      qs("#doSync").addEventListener("click", () => doSync().catch((e) => { err(String(e)); msg(""); }));
      qs("#doEmbedAuto").addEventListener("click", () => doEmbedAuto().catch((e) => { err(String(e)); msg(""); }));
      qs("#loadEmbedStatus").addEventListener("click", () => loadEmbedStatus().catch((e) => { err(String(e)); msg(""); }));
      qs("#loadEmbedPlan").addEventListener("click", () => loadEmbedPlan().catch((e) => { err(String(e)); msg(""); }));
      qs("#doEmbedBuild").addEventListener("click", () => doEmbedBuild().catch((e) => { err(String(e)); msg(""); }));
      qs("#enqueueEmbedJob").addEventListener("click", () => enqueueEmbedJob().catch((e) => { err(String(e)); msg(""); }));
      qs("#loadEmbedJobs").addEventListener("click", () => loadEmbedJobs().catch((e) => { err(String(e)); msg(""); }));
      qs("#loadEmbedJobsConfig").addEventListener("click", () => loadEmbedJobsConfig().catch((e) => { err(String(e)); msg(""); }));
      qs("#saveEmbedJobsConfig").addEventListener("click", () => saveEmbedJobsConfig().catch((e) => { err(String(e)); msg(""); }));
      qs("#cancelEmbedJob").addEventListener("click", () => cancelEmbedJob().catch((e) => { err(String(e)); msg(""); }));
      qs("#retryEmbedJob").addEventListener("click", () => retryEmbedJob().catch((e) => { err(String(e)); msg(""); }));
      qs("#loadEmbedFailures").addEventListener("click", () => loadEmbedFailures().catch((e) => { err(String(e)); msg(""); }));
      qs("#retryFailedEmbedJobs").addEventListener("click", () => retryFailedEmbedJobs().catch((e) => { err(String(e)); msg(""); }));
      qs("#loadEmbedGovernance").addEventListener("click", () => loadEmbedGovernance().catch((e) => { err(String(e)); msg(""); }));
      qs("#saveEmbedGovernance").addEventListener("click", () => saveEmbedGovernance().catch((e) => { err(String(e)); msg(""); }));
      qs("#applyEmbedGovernance").addEventListener("click", () => applyEmbedGovernance().catch((e) => { err(String(e)); msg(""); }));
      qs("#doRefreshRepo").addEventListener("click", () => doRefreshRepo().catch((e) => { err(String(e)); msg(""); }));
      qs("#startEvents").addEventListener("click", () => startEvents());
      qs("#stopEvents").addEventListener("click", () => stopEvents());
      qs("#loadWatch").addEventListener("click", () => loadWatch().catch(() => {}));
      qs("#exportEventsJson").addEventListener("click", () => exportEvents("json").catch((e) => { err(String(e)); msg(""); }));
      qs("#exportEventsMd").addEventListener("click", () => exportEvents("md").catch((e) => { err(String(e)); msg(""); }));
      qs("#exportDiagJson").addEventListener("click", () => exportDiagnostics("json").catch((e) => { err(String(e)); msg(""); }));
      qs("#exportDiagMd").addEventListener("click", () => exportDiagnostics("md").catch((e) => { err(String(e)); msg(""); }));
      qs("#startWatch").addEventListener("click", () => apiPost("/watch/start", {
        intervalMs: Number((qs("#watchInterval").value || "").trim() || 2000),
        sync: !!qs("#watchSync").checked,
        embed: !!qs("#watchEmbed").checked
      }).then(() => loadWatch()).catch((e) => { err(String(e)); msg(""); }));
      qs("#stopWatch").addEventListener("click", () => apiPost("/watch/stop", {}).then(() => loadWatch()).catch((e) => { err(String(e)); msg(""); }));

      qs("#tabs").addEventListener("click", (ev) => {
        const t = ev.target && ev.target.dataset && ev.target.dataset.tab;
        if (!t) return;
        setTab(t);
      });

      loadToken();
      setTab("md");
      qs("#base").textContent = location.origin + API_BASE;
      loadStatus().catch((e) => { err(String(e)); msg(""); });
      loadWatch().catch(() => {});
    </script>
  </body>
</html>
`;
}
