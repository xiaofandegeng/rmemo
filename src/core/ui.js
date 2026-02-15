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

            <div class="row">
              <button class="btn" id="refreshAll">Refresh</button>
              <button class="btn secondary" id="loadStatus">Status</button>
              <button class="btn secondary" id="loadRules">Rules</button>
              <button class="btn secondary" id="loadTodos">Todos</button>
              <button class="btn secondary" id="loadContext">Context</button>
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

      qs("#saveToken").addEventListener("click", saveToken);
      qs("#clearToken").addEventListener("click", clearToken);
      qs("#refreshAll").addEventListener("click", async () => { await loadStatus(); });
      qs("#loadStatus").addEventListener("click", loadStatus);
      qs("#loadRules").addEventListener("click", loadRules);
      qs("#loadTodos").addEventListener("click", loadTodos);
      qs("#loadContext").addEventListener("click", loadContext);
      qs("#doSearch").addEventListener("click", () => doSearch().catch((e) => { err(String(e)); msg(""); }));
      qs("#doFocus").addEventListener("click", () => doFocus().catch((e) => { err(String(e)); msg(""); }));

      qs("#tabs").addEventListener("click", (ev) => {
        const t = ev.target && ev.target.dataset && ev.target.dataset.tab;
        if (!t) return;
        setTab(t);
      });

      loadToken();
      setTab("md");
      qs("#base").textContent = location.origin + API_BASE;
      loadStatus().catch((e) => { err(String(e)); msg(""); });
    </script>
  </body>
</html>
`;
}

