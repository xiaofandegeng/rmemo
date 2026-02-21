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
                    <label style="display:flex; gap:6px; align-items:center;">
                      <input id="govBenchmarkAutoAdoptEnabled" type="checkbox" />
                      <span class="hint" style="margin:0;">benchmark auto adopt</span>
                    </label>
                    <input id="govWindow" type="text" placeholder="gov window (jobs)" style="width: 180px;" />
                    <input id="govFailureRateHigh" type="text" placeholder="gov failure threshold (0~1)" style="width: 220px;" />
                    <input id="govBenchmarkMinScore" type="text" placeholder="benchmark min score (0~100)" style="width: 220px;" />
                    <input id="govBenchmarkMinGap" type="text" placeholder="benchmark min gap (0~50)" style="width: 200px;" />
                    <select id="govSimMode">
                      <option value="recommend" selected>simulate: recommend</option>
                      <option value="apply_top">simulate: apply_top</option>
                    </select>
                    <select id="govBenchMode">
                      <option value="apply_top" selected>benchmark: apply_top</option>
                      <option value="recommend">benchmark: recommend</option>
                    </select>
                    <button class="btn secondary" id="loadEmbedGovernance">Governance</button>
                    <button class="btn secondary" id="loadEmbedGovernanceHistory">Gov History</button>
                    <button class="btn secondary" id="simulateEmbedGovernance">Simulate</button>
                    <button class="btn secondary" id="benchmarkEmbedGovernance">Benchmark</button>
                    <button class="btn secondary" id="benchmarkAdoptEmbedGovernance">Benchmark + Adopt</button>
                    <button class="btn secondary" id="saveEmbedGovernance">Save Governance</button>
                    <button class="btn secondary" id="applyEmbedGovernance">Apply Top Suggestion</button>
                  </div>
                  <div style="height: 8px;"></div>
                  <div class="row">
                    <input id="govVersionId" type="text" placeholder="governance version id to rollback" style="min-width: 280px; flex: 1;" />
                    <button class="btn secondary" id="rollbackEmbedGovernance">Rollback Version</button>
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

            <div>
              <label>Workspace Hub (Monorepo)</label>
              <div class="row">
                <input id="wsOnly" type="text" placeholder="only dirs (optional, comma-separated)" />
              </div>
              <div style="height: 8px;"></div>
              <div class="row">
                <label style="display:flex; gap:6px; align-items:center;">
                  <input id="wsSaveSnapshot" type="checkbox" />
                  <span class="hint" style="margin:0;">save snapshot</span>
                </label>
                <label style="display:flex; gap:6px; align-items:center;">
                  <input id="wsCompareLatest" type="checkbox" />
                  <span class="hint" style="margin:0;">compare latest</span>
                </label>
                <input id="wsTag" type="text" placeholder="snapshot tag (optional)" style="width: 220px;" />
              </div>
              <div style="height: 8px;"></div>
              <div class="row">
                <button class="btn secondary" id="loadWsList">WS List</button>
                <button class="btn secondary" id="doWsFocus">WS Focus</button>
                <button class="btn secondary" id="loadWsSnapshots">WS Snapshots</button>
              </div>
              <div style="height: 8px;"></div>
              <div class="row">
                <input id="wsFromId" type="text" placeholder="snapshot from id" style="width: 280px;" />
                <input id="wsToId" type="text" placeholder="snapshot to id" style="width: 280px;" />
                <button class="btn secondary" id="doWsCompare">WS Compare</button>
                <button class="btn secondary" id="doWsReport">WS Report</button>
              </div>
              <div style="height: 8px;"></div>
              <div class="row">
                <label style="display:flex; gap:6px; align-items:center;">
                  <input id="wsSaveReport" type="checkbox" />
                  <span class="hint" style="margin:0;">save report</span>
                </label>
                <input id="wsReportTag" type="text" placeholder="report tag (optional)" style="width: 220px;" />
                <button class="btn secondary" id="loadWsReports">WS Reports</button>
              </div>
              <div style="height: 8px;"></div>
              <div class="row">
                <input id="wsReportId" type="text" placeholder="saved report id" style="width: 380px;" />
                <button class="btn secondary" id="showWsReport">Show WS Report</button>
              </div>
              <div style="height: 8px;"></div>
              <div class="row">
                <button class="btn secondary" id="loadWsTrends">WS Trends</button>
                <input id="wsTrendKey" type="text" placeholder="trend key (mode::query)" style="width: 380px;" />
                <button class="btn secondary" id="showWsTrend">Show WS Trend</button>
              </div>
              <div style="height: 8px;"></div>
              <div class="row">
                <button class="btn secondary" id="loadWsAlerts">WS Alerts</button>
                <button class="btn secondary" id="loadWsAlertsConfig">WS Alerts Config</button>
                <button class="btn secondary" id="runWsAlertsAuto">WS Alerts Auto-Gov</button>
                <button class="btn secondary" id="loadWsAlertsHistory">WS Alerts History</button>
                <button class="btn secondary" id="showWsAlertsRca">WS Alerts RCA</button>
              </div>
              <div style="height: 8px;"></div>
              <div class="row">
                <input id="wsIncidentId" type="text" placeholder="incident id (optional for RCA)" style="width: 380px;" />
                <input id="wsActionId" type="text" placeholder="action id (for show/apply)" style="width: 380px;" />
              </div>
              <div style="height: 8px;"></div>
              <div class="row">
                <button class="btn secondary" id="showWsAlertsActionPlan">WS Alerts Action Plan</button>
                <button class="btn secondary" id="loadWsAlertsActionHistory">WS Alerts Action History</button>
                <button class="btn secondary" id="showWsAlertsAction">WS Alerts Action</button>
                <button class="btn secondary" id="applyWsAlertsAction">WS Alerts Apply</button>
                <label style="display:flex; gap:6px; align-items:center;">
                  <input id="wsActionIncludeBlockers" type="checkbox" />
                  <span class="hint" style="margin:0;">include blockers</span>
                </label>
              </div>
              <div style="height: 8px;"></div>
              <div class="row">
                <input id="wsBoardId" type="text" placeholder="board id (for show/update)" style="width: 380px;" />
                <input id="wsBoardItemId" type="text" placeholder="board item id (for update)" style="width: 380px;" />
                <select id="wsBoardStatus" style="width: 130px;">
                  <option value="todo">todo</option>
                  <option value="doing">doing</option>
                  <option value="done">done</option>
                  <option value="blocked">blocked</option>
                </select>
              </div>
              <div style="height: 8px;"></div>
              <div class="row">
                <button class="btn secondary" id="loadWsAlertsBoards">WS Alerts Boards</button>
                <button class="btn secondary" id="createWsAlertsBoard">WS Alerts Board Create</button>
                <button class="btn secondary" id="showWsAlertsBoard">WS Alerts Board</button>
                <button class="btn secondary" id="updateWsAlertsBoardItem">WS Alerts Board Update</button>
              </div>
              <div style="height: 8px;"></div>
              <div class="row">
                <input id="wsBoardCloseReason" type="text" placeholder="board close reason (optional)" style="width: 520px;" />
                <label style="display:flex; gap:6px; align-items:center;">
                  <input id="wsBoardCloseForce" type="checkbox" />
                  <span class="hint" style="margin:0;">force close</span>
                </label>
                <button class="btn secondary" id="showWsAlertsBoardReport">WS Alerts Board Report</button>
                <button class="btn secondary" id="closeWsAlertsBoard">WS Alerts Board Close</button>
              </div>
              <div style="height: 8px;"></div>
              <div class="row" style="background: rgba(255,255,255,0.02); padding: 8px; border-radius: 8px; border: 1px solid var(--border);">
                <input id="wsActionJobId" type="text" placeholder="action job id" style="width: 250px;" />
                <input id="wsActionJobLimit" type="number" min="1" step="1" placeholder="limit" style="width: 80px;" value="20" />
                <button class="btn secondary" id="loadWsAlertsActionJobs">Action Jobs List</button>
                <button class="btn secondary" id="showWsAlertsActionJob">Show Job</button>
                <button class="btn secondary" id="pauseWsAlertsActionJob">Pause</button>
                <button class="btn secondary" id="resumeWsAlertsActionJob">Resume</button>
                <button class="btn secondary" id="cancelWsAlertsActionJob">Cancel</button>
              </div>
              <div style="height: 8px;"></div>
              <div class="row">
                <span style="font-size: 13px; margin-right: 4px;">Global Policy:</span>
                <select id="wsPulsePolicyGlobal" style="width: 100px;">
                  <option value="balanced">balanced</option>
                  <option value="strict">strict</option>
                  <option value="relaxed">relaxed</option>
                  <option value="custom">custom</option>
                </select>
                <span style="font-size: 13px; margin-left: 12px; margin-right: 4px;">Dedupe:</span>
                <select id="wsPulseDedupePolicyGlobal" style="width: 100px;">
                  <option value="balanced">balanced</option>
                  <option value="strict">strict</option>
                  <option value="relaxed">relaxed</option>
                  <option value="custom">custom</option>
                </select>
                <button class="btn secondary" id="loadWsAlertsBoardPolicy">Load Policy Defaults</button>
                <button class="btn secondary" id="saveWsAlertsBoardPolicy">Save Policy Defaults</button>
              </div>
              <div style="height: 8px;"></div>
              <div class="row">
                <input id="wsPulseTodoHours" type="number" min="1" step="1" placeholder="todo hours" style="width: 100px;" />
                <input id="wsPulseDoingHours" type="number" min="1" step="1" placeholder="doing hours" style="width: 100px;" />
                <input id="wsPulseBlockedHours" type="number" min="1" step="1" placeholder="blocked hours" style="width: 100px;" />
                <select id="wsPulsePolicyOverride" style="width: 100px;">
                  <option value="">--</option>
                  <option value="strict">strict</option>
                  <option value="balanced">balanced</option>
                  <option value="relaxed">relaxed</option>
                  <option value="custom">custom</option>
                </select>
                <input id="wsPulseLimitItems" type="number" min="1" step="1" placeholder="limit items" style="width: 100px;" value="20" />
                <label style="display:flex; gap:6px; align-items:center;">
                  <input id="wsPulseSave" type="checkbox" />
                  <span class="hint" style="margin:0;">save pulse</span>
                </label>
                <label style="display:flex; gap:6px; align-items:center;">
                  <input id="wsPulseIncludeWarn" type="checkbox" />
                  <span class="hint" style="margin:0;">include warn</span>
                </label>
                <label style="display:flex; gap:6px; align-items:center;">
                  <input id="wsPulseDedupe" type="checkbox" checked />
                  <span class="hint" style="margin:0;">dedupe</span>
                </label>
                <input id="wsPulseDedupeWindowHours" type="number" min="1" step="1" placeholder="dedupe hours" style="width: 100px;" />
                <label style="display:flex; gap:6px; align-items:center;">
                  <input id="wsPulseDryRun" type="checkbox" />
                  <span class="hint" style="margin:0;">dry run</span>
                </label>
              </div>
              <div style="height: 8px;"></div>
              <div class="row">
                <button class="btn secondary" id="runWsAlertsBoardPulse">WS Alerts Board Pulse</button>
                <button class="btn secondary" id="runWsAlertsBoardPulsePlan">WS Alerts Pulse Plan</button>
                <button class="btn secondary" id="applyWsAlertsBoardPulsePlan">WS Alerts Pulse Apply</button>
                <button class="btn secondary" id="loadWsAlertsBoardPulseHistory">WS Alerts Pulse History</button>
              </div>
              <div style="height: 8px;"></div>
              <div class="row">
                <label style="display:flex; gap:6px; align-items:center;">
                  <input id="wsAlertsEnabled" type="checkbox" checked />
                  <span class="hint" style="margin:0;">alerts enabled</span>
                </label>
                <label style="display:flex; gap:6px; align-items:center;">
                  <input id="wsAlertsAutoGovEnabled" type="checkbox" />
                  <span class="hint" style="margin:0;">auto governance</span>
                </label>
              </div>
              <div style="height: 8px;"></div>
              <div class="row">
                <input id="wsAlertsMinReports" type="number" min="1" step="1" placeholder="min reports" style="width: 130px;" />
                <input id="wsAlertsMaxRegressed" type="number" min="0" step="1" placeholder="max regressed" style="width: 140px;" />
                <input id="wsAlertsMaxAvgChanged" type="number" min="0" step="0.1" placeholder="max avg changed" style="width: 160px;" />
                <input id="wsAlertsMaxChanged" type="number" min="0" step="1" placeholder="max changed" style="width: 130px;" />
                <button class="btn secondary" id="saveWsAlertsConfig">Save WS Alerts Config</button>
              </div>
              <div class="hint">Use existing query + mode above; outputs aggregated JSON from <span style="font-family: var(--mono)">/ws/list</span> and <span style="font-family: var(--mono)">/ws/focus</span>.</div>
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

      async function loadWsList() {
        err(""); msg("Loading workspace list...");
        const only = (qs("#wsOnly").value || "").trim();
        let p = "/ws/list";
        if (only) p += "?only=" + encodeURIComponent(only);
        const j = await apiFetch(p, { accept: "application/json", json: true });
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace List";
      }

      async function doWsFocus() {
        err(""); msg("Running workspace focus...");
        const q = (qs("#q").value || "").trim();
        const mode = qs("#mode").value;
        const only = (qs("#wsOnly").value || "").trim();
        const save = !!qs("#wsSaveSnapshot").checked;
        const compareLatest = !!qs("#wsCompareLatest").checked;
        const tag = (qs("#wsTag").value || "").trim();
        if (!q) return msg("Missing query.");
        let p = "/ws/focus?q=" + encodeURIComponent(q) + "&mode=" + encodeURIComponent(mode) + "&includeStatus=0";
        if (only) p += "&only=" + encodeURIComponent(only);
        if (save) p += "&save=1";
        if (compareLatest) p += "&compareLatest=1";
        if (tag) p += "&tag=" + encodeURIComponent(tag);
        const j = await apiFetch(p, { accept: "application/json", json: true });
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Focus";
      }

      async function loadWsSnapshots() {
        err(""); msg("Loading workspace snapshots...");
        const j = await apiFetch("/ws/focus/snapshots?limit=30", { accept: "application/json", json: true });
        const first = j && Array.isArray(j.snapshots) && j.snapshots.length ? j.snapshots[0] : null;
        if (first && first.id) {
          qs("#wsFromId").value = first.id;
          qs("#wsToId").value = first.id;
        }
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Snapshots";
      }

      async function doWsCompare() {
        err(""); msg("Comparing workspace snapshots...");
        const from = (qs("#wsFromId").value || "").trim();
        const to = (qs("#wsToId").value || "").trim();
        if (!from || !to) return msg("Missing snapshot ids.");
        const p = "/ws/focus/compare?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to);
        const j = await apiFetch(p, { accept: "application/json", json: true });
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Compare";
      }

      async function doWsReport() {
        err(""); msg("Generating workspace drift report...");
        const from = (qs("#wsFromId").value || "").trim();
        const to = (qs("#wsToId").value || "").trim();
        const save = !!qs("#wsSaveReport").checked;
        const tag = (qs("#wsReportTag").value || "").trim();
        const tab = qs("#out").dataset.tab || "json";
        const fmt = tab === "md" ? "md" : "json";
        let p = "/ws/focus/report?format=" + encodeURIComponent(fmt);
        if (from) p += "&from=" + encodeURIComponent(from);
        if (to) p += "&to=" + encodeURIComponent(to);
        if (save) p += "&save=1";
        if (tag) p += "&tag=" + encodeURIComponent(tag);
        if (fmt === "md") {
          const t = await apiFetch(p, { accept: "text/markdown" });
          out(t);
          setTab("md");
        } else {
          const j = await apiFetch(p, { accept: "application/json", json: true });
          if (j && j.savedReport && j.savedReport.id) qs("#wsReportId").value = j.savedReport.id;
          out(JSON.stringify(j, null, 2));
          setTab("json");
        }
        msg("OK");
        qs("#title").textContent = "Workspace Drift Report";
      }

      async function loadWsReports() {
        err(""); msg("Loading workspace report history...");
        const j = await apiFetch("/ws/focus/reports?limit=30", { accept: "application/json", json: true });
        const first = j && Array.isArray(j.reports) && j.reports.length ? j.reports[0] : null;
        if (first && first.id) qs("#wsReportId").value = first.id;
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Report History";
      }

      async function showWsReport() {
        err(""); msg("Loading workspace report...");
        const id = (qs("#wsReportId").value || "").trim();
        if (!id) return msg("Missing report id.");
        const tab = qs("#out").dataset.tab || "json";
        const fmt = tab === "md" ? "md" : "json";
        const p = "/ws/focus/report-item?id=" + encodeURIComponent(id) + "&format=" + encodeURIComponent(fmt);
        if (fmt === "md") {
          const t = await apiFetch(p, { accept: "text/markdown" });
          out(t);
          setTab("md");
        } else {
          const j = await apiFetch(p, { accept: "application/json", json: true });
          out(JSON.stringify(j, null, 2));
          setTab("json");
        }
        msg("OK");
        qs("#title").textContent = "Workspace Saved Report";
      }

      async function loadWsTrends() {
        err(""); msg("Loading workspace trends...");
        const j = await apiFetch("/ws/focus/trends?limitGroups=30&limitReports=200", { accept: "application/json", json: true });
        const first = j && Array.isArray(j.groups) && j.groups.length ? j.groups[0] : null;
        if (first && first.key) qs("#wsTrendKey").value = first.key;
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Trends";
      }

      async function showWsTrend() {
        err(""); msg("Loading workspace trend...");
        const key = (qs("#wsTrendKey").value || "").trim();
        if (!key) return msg("Missing trend key.");
        const tab = qs("#out").dataset.tab || "json";
        const fmt = tab === "md" ? "md" : "json";
        const p = "/ws/focus/trend?key=" + encodeURIComponent(key) + "&format=" + encodeURIComponent(fmt) + "&limit=100";
        if (fmt === "md") {
          const t = await apiFetch(p, { accept: "text/markdown" });
          out(t);
          setTab("md");
        } else {
          const j = await apiFetch(p, { accept: "application/json", json: true });
          out(JSON.stringify(j, null, 2));
          setTab("json");
        }
        msg("OK");
        qs("#title").textContent = "Workspace Trend";
      }

      async function loadWsAlerts() {
        err(""); msg("Loading workspace alerts...");
        const key = (qs("#wsTrendKey").value || "").trim();
        let p = "/ws/focus/alerts?limitGroups=30&limitReports=200";
        if (key) p += "&key=" + encodeURIComponent(key);
        const j = await apiFetch(p, { accept: "application/json", json: true });
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Alerts";
      }

      async function loadWsAlertsConfig() {
        err(""); msg("Loading workspace alerts config...");
        const j = await apiFetch("/ws/focus/alerts/config", { accept: "application/json", json: true });
        const c = j && j.config ? j.config : {};
        if (c.enabled !== undefined) qs("#wsAlertsEnabled").checked = !!c.enabled;
        if (c.autoGovernanceEnabled !== undefined) qs("#wsAlertsAutoGovEnabled").checked = !!c.autoGovernanceEnabled;
        if (c.minReports !== undefined) qs("#wsAlertsMinReports").value = String(c.minReports);
        if (c.maxRegressedErrors !== undefined) qs("#wsAlertsMaxRegressed").value = String(c.maxRegressedErrors);
        if (c.maxAvgChangedCount !== undefined) qs("#wsAlertsMaxAvgChanged").value = String(c.maxAvgChangedCount);
        if (c.maxChangedCount !== undefined) qs("#wsAlertsMaxChanged").value = String(c.maxChangedCount);
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Config";
      }

      async function saveWsAlertsConfig() {
        err(""); msg("Saving workspace alerts config...");
        const body = {
          enabled: !!qs("#wsAlertsEnabled").checked,
          autoGovernanceEnabled: !!qs("#wsAlertsAutoGovEnabled").checked
        };
        const minReports = Number((qs("#wsAlertsMinReports").value || "").trim());
        const maxRegressedErrors = Number((qs("#wsAlertsMaxRegressed").value || "").trim());
        const maxAvgChangedCount = Number((qs("#wsAlertsMaxAvgChanged").value || "").trim());
        const maxChangedCount = Number((qs("#wsAlertsMaxChanged").value || "").trim());
        if (Number.isFinite(minReports) && minReports > 0) body.minReports = minReports;
        if (Number.isFinite(maxRegressedErrors) && maxRegressedErrors >= 0) body.maxRegressedErrors = maxRegressedErrors;
        if (Number.isFinite(maxAvgChangedCount) && maxAvgChangedCount >= 0) body.maxAvgChangedCount = maxAvgChangedCount;
        if (Number.isFinite(maxChangedCount) && maxChangedCount >= 0) body.maxChangedCount = maxChangedCount;
        const j = await apiPost("/ws/focus/alerts/config", body);
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Config Saved";
      }

      async function runWsAlertsAuto() {
        err(""); msg("Running workspace alerts auto-governance check...");
        const j = await apiPost("/ws/focus/alerts/check?autoGovernance=1&source=ui", {});
        if (j && j.incident && j.incident.id) qs("#wsIncidentId").value = j.incident.id;
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Auto Governance";
      }

      async function loadWsAlertsHistory() {
        err(""); msg("Loading workspace alerts history...");
        const key = (qs("#wsTrendKey").value || "").trim();
        let p = "/ws/focus/alerts/history?limit=30";
        if (key) p += "&key=" + encodeURIComponent(key);
        const j = await apiFetch(p, { accept: "application/json", json: true });
        const first = j && Array.isArray(j.incidents) && j.incidents.length ? j.incidents[0] : null;
        if (first && first.id) qs("#wsIncidentId").value = first.id;
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Alerts History";
      }

      async function showWsAlertsRca() {
        err(""); msg("Generating workspace alerts RCA...");
        const key = (qs("#wsTrendKey").value || "").trim();
        const incidentId = (qs("#wsIncidentId").value || "").trim();
        const tab = qs("#out").dataset.tab || "json";
        const fmt = tab === "md" ? "md" : "json";
        let p = "/ws/focus/alerts/rca?format=" + encodeURIComponent(fmt) + "&limit=20";
        if (key) p += "&key=" + encodeURIComponent(key);
        if (incidentId) p += "&incidentId=" + encodeURIComponent(incidentId);
        if (fmt === "md") {
          const t = await apiFetch(p, { accept: "text/markdown" });
          out(t);
          setTab("md");
        } else {
          const j = await apiFetch(p, { accept: "application/json", json: true });
          out(JSON.stringify(j, null, 2));
          setTab("json");
        }
        msg("OK");
        qs("#title").textContent = "Workspace Alerts RCA";
      }

      async function showWsAlertsActionPlan() {
        err(""); msg("Generating workspace alerts action plan...");
        const key = (qs("#wsTrendKey").value || "").trim();
        const incidentId = (qs("#wsIncidentId").value || "").trim();
        const tab = qs("#out").dataset.tab || "json";
        const fmt = tab === "md" ? "md" : "json";
        let p = "/ws/focus/alerts/action-plan?format=" + encodeURIComponent(fmt) + "&limit=20&save=1&tag=ui";
        if (key) p += "&key=" + encodeURIComponent(key);
        if (incidentId) p += "&incidentId=" + encodeURIComponent(incidentId);
        if (fmt === "md") {
          const t = await apiFetch(p, { accept: "text/markdown" });
          out(t);
          setTab("md");
        } else {
          const j = await apiFetch(p, { accept: "application/json", json: true });
          if (j && j.savedAction && j.savedAction.id) qs("#wsActionId").value = j.savedAction.id;
          out(JSON.stringify(j, null, 2));
          setTab("json");
        }
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Action Plan";
      }

      async function loadWsAlertsActionHistory() {
        err(""); msg("Loading workspace alerts action history...");
        const j = await apiFetch("/ws/focus/alerts/actions?limit=30", { accept: "application/json", json: true });
        const first = j && Array.isArray(j.actions) && j.actions.length ? j.actions[0] : null;
        if (first && first.id) qs("#wsActionId").value = first.id;
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Action History";
      }

      async function showWsAlertsAction() {
        err(""); msg("Loading workspace alerts action...");
        const id = (qs("#wsActionId").value || "").trim();
        if (!id) return msg("Missing action id.");
        const tab = qs("#out").dataset.tab || "json";
        const fmt = tab === "md" ? "md" : "json";
        const p = "/ws/focus/alerts/action-item?id=" + encodeURIComponent(id) + "&format=" + encodeURIComponent(fmt);
        if (fmt === "md") {
          const t = await apiFetch(p, { accept: "text/markdown" });
          out(t);
          setTab("md");
        } else {
          const j = await apiFetch(p, { accept: "application/json", json: true });
          out(JSON.stringify(j, null, 2));
          setTab("json");
        }
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Action";
      }

      async function applyWsAlertsAction() {
        err(""); msg("Applying workspace alerts action...");
        const id = (qs("#wsActionId").value || "").trim();
        if (!id) return msg("Missing action id.");
        const body = {
          id,
          includeBlockers: !!qs("#wsActionIncludeBlockers").checked,
          noLog: false,
          maxTasks: 20
        };
        const j = await apiPost("/ws/focus/alerts/action-apply", body);
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Action Apply";
      }

      async function loadWsAlertsBoards() {
        err(""); msg("Loading workspace alerts boards...");
        const j = await apiFetch("/ws/focus/alerts/boards?limit=30", { accept: "application/json", json: true });
        const first = j && Array.isArray(j.boards) && j.boards.length ? j.boards[0] : null;
        if (first && first.id) qs("#wsBoardId").value = first.id;
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Boards";
      }

      async function createWsAlertsBoard() {
        err(""); msg("Creating workspace alerts board...");
        const actionId = (qs("#wsActionId").value || "").trim();
        if (!actionId) return msg("Missing action id.");
        const j = await apiPost("/ws/focus/alerts/board-create", { actionId });
        if (j && j.result && j.result.id) qs("#wsBoardId").value = j.result.id;
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Board Created";
      }

      async function showWsAlertsBoard() {
        err(""); msg("Loading workspace alerts board...");
        const id = (qs("#wsBoardId").value || "").trim();
        if (!id) return msg("Missing board id.");
        const tab = qs("#out").dataset.tab || "json";
        const fmt = tab === "md" ? "md" : "json";
        const p = "/ws/focus/alerts/board-item?id=" + encodeURIComponent(id) + "&format=" + encodeURIComponent(fmt);
        if (fmt === "md") {
          const t = await apiFetch(p, { accept: "text/markdown" });
          out(t);
          setTab("md");
        } else {
          const j = await apiFetch(p, { accept: "application/json", json: true });
          const first = j && Array.isArray(j.items) && j.items.length ? j.items[0] : null;
          if (first && first.id) qs("#wsBoardItemId").value = first.id;
          out(JSON.stringify(j, null, 2));
          setTab("json");
        }
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Board";
      }

      async function updateWsAlertsBoardItem() {
        err(""); msg("Updating workspace alerts board item...");
        const boardId = (qs("#wsBoardId").value || "").trim();
        const itemId = (qs("#wsBoardItemId").value || "").trim();
        const status = (qs("#wsBoardStatus").value || "").trim();
        if (!boardId) return msg("Missing board id.");
        if (!itemId) return msg("Missing board item id.");
        if (!status) return msg("Missing board status.");
        const j = await apiPost("/ws/focus/alerts/board-update", { boardId, itemId, status });
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Board Item Updated";
      }

      async function showWsAlertsBoardReport() {
        err(""); msg("Generating workspace alerts board report...");
        const id = (qs("#wsBoardId").value || "").trim();
        if (!id) return msg("Missing board id.");
        const tab = qs("#out").dataset.tab || "json";
        const fmt = tab === "md" ? "md" : "json";
        const p = "/ws/focus/alerts/board-report?id=" + encodeURIComponent(id) + "&format=" + encodeURIComponent(fmt) + "&maxItems=30";
        if (fmt === "md") {
          const t = await apiFetch(p, { accept: "text/markdown" });
          out(t);
          setTab("md");
        } else {
          const j = await apiFetch(p, { accept: "application/json", json: true });
          out(JSON.stringify(j, null, 2));
          setTab("json");
        }
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Board Report";
      }

      async function closeWsAlertsBoard() {
        err(""); msg("Closing workspace alerts board...");
        const boardId = (qs("#wsBoardId").value || "").trim();
        if (!boardId) return msg("Missing board id.");
        const reason = (qs("#wsBoardCloseReason").value || "").trim();
        const force = !!qs("#wsBoardCloseForce").checked;
        const j = await apiPost("/ws/focus/alerts/board-close", { boardId, reason, force, noLog: false });
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Board Closed";
      }

      async function runWsAlertsBoardPulse() {
        err(""); msg("Evaluating workspace alerts board pulse...");
        const rawTodo = (qs("#wsPulseTodoHours").value || "").trim();
        const rawDoing = (qs("#wsPulseDoingHours").value || "").trim();
        const rawBlocked = (qs("#wsPulseBlockedHours").value || "").trim();
        const todoHours = rawTodo ? Number(rawTodo) : undefined;
        const doingHours = rawDoing ? Number(rawDoing) : undefined;
        const blockedHours = rawBlocked ? Number(rawBlocked) : undefined;
        const policyOverride = qs("#wsPulsePolicyOverride").value;
        const save = !!qs("#wsPulseSave").checked;
        let p = "/ws/focus/alerts/board-pulse?limitBoards=50";
        if (Number.isFinite(todoHours) && todoHours > 0) p += "&todoHours=" + encodeURIComponent(String(todoHours));
        if (Number.isFinite(doingHours) && doingHours > 0) p += "&doingHours=" + encodeURIComponent(String(doingHours));
        if (Number.isFinite(blockedHours) && blockedHours > 0) p += "&blockedHours=" + encodeURIComponent(String(blockedHours));
        if (policyOverride) p += "&policy=" + encodeURIComponent(policyOverride);
        if (save) p += "&save=1&source=ui";
        const j = await apiFetch(p, { accept: "application/json", json: true });
        if (j && j.incident && j.incident.id) pushLive({ type: "ws:alerts:board-pulse", incidentId: j.incident.id });
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Board Pulse";
      }

      async function loadWsAlertsBoardPulseHistory() {
        err(""); msg("Loading workspace alerts board pulse history...");
        const j = await apiFetch("/ws/focus/alerts/board-pulse-history?limit=30", { accept: "application/json", json: true });
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Board Pulse History";
      }

      // --- Action Jobs ---
      async function loadWsAlertsActionJobs() {
        err(""); msg("Loading workspace alerts action jobs...");
        const limit = Number((qs("#wsActionJobLimit").value || "").trim() || 20);
        const j = await apiFetch("/ws/focus/alerts/action-jobs?limit=" + encodeURIComponent(String(limit)), { accept: "application/json", json: true });
        const first = j && Array.isArray(j.jobs) && j.jobs.length ? j.jobs[0] : null;
        if (first && first.id) qs("#wsActionJobId").value = first.id;
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Action Jobs";
      }

      async function showWsAlertsActionJob() {
        err(""); msg("Loading workspace alerts action job...");
        const id = (qs("#wsActionJobId").value || "").trim();
        if (!id) return msg("Missing job id.");
        const j = await apiFetch("/ws/focus/alerts/action-jobs/" + encodeURIComponent(id), { accept: "application/json", json: true });
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Action Job Details";
      }

      async function pauseWsAlertsActionJob() {
        err(""); msg("Pausing workspace alerts action job...");
        const id = (qs("#wsActionJobId").value || "").trim();
        if (!id) return msg("Missing job id.");
        const j = await apiPost("/ws/focus/alerts/action-jobs/" + encodeURIComponent(id) + "/pause", {});
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Action Job Paused";
      }

      async function resumeWsAlertsActionJob() {
        err(""); msg("Resuming workspace alerts action job...");
        const id = (qs("#wsActionJobId").value || "").trim();
        if (!id) return msg("Missing job id.");
        const j = await apiPost("/ws/focus/alerts/action-jobs/" + encodeURIComponent(id) + "/resume", {});
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Action Job Resumed";
      }

      async function cancelWsAlertsActionJob() {
        err(""); msg("Canceling workspace alerts action job...");
        const id = (qs("#wsActionJobId").value || "").trim();
        if (!id) return msg("Missing job id.");
        const j = await apiPost("/ws/focus/alerts/action-jobs/" + encodeURIComponent(id) + "/cancel", {});
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Action Job Canceled";
      }

      async function runWsAlertsBoardPulsePlan() {
        err(""); msg("Generating workspace alerts board pulse plan...");
        const rawTodo = (qs("#wsPulseTodoHours").value || "").trim();
        const rawDoing = (qs("#wsPulseDoingHours").value || "").trim();
        const rawBlocked = (qs("#wsPulseBlockedHours").value || "").trim();
        const todoHours = rawTodo ? Number(rawTodo) : undefined;
        const doingHours = rawDoing ? Number(rawDoing) : undefined;
        const blockedHours = rawBlocked ? Number(rawBlocked) : undefined;
        const policyOverride = qs("#wsPulsePolicyOverride").value;
        const limitItems = Number((qs("#wsPulseLimitItems").value || "").trim() || 20);
        const includeWarn = !!qs("#wsPulseIncludeWarn").checked;
        const tab = qs("#out").dataset.tab || "json";
        const fmt = tab === "md" ? "md" : "json";
        let p = "/ws/focus/alerts/board-pulse-plan?limitBoards=50&format=" + encodeURIComponent(fmt);
        if (Number.isFinite(todoHours) && todoHours > 0) p += "&todoHours=" + encodeURIComponent(String(todoHours));
        if (Number.isFinite(doingHours) && doingHours > 0) p += "&doingHours=" + encodeURIComponent(String(doingHours));
        if (Number.isFinite(blockedHours) && blockedHours > 0) p += "&blockedHours=" + encodeURIComponent(String(blockedHours));
        if (policyOverride) p += "&policy=" + encodeURIComponent(policyOverride);
        if (Number.isFinite(limitItems) && limitItems > 0) p += "&limitItems=" + encodeURIComponent(String(limitItems));
        if (includeWarn) p += "&includeWarn=1";
        if (fmt === "md") {
          const t = await apiFetch(p, { accept: "text/markdown" });
          out(t);
          setTab("md");
        } else {
          const j = await apiFetch(p, { accept: "application/json", json: true });
          out(JSON.stringify(j, null, 2));
          setTab("json");
        }
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Board Pulse Plan";
      }

      async function applyWsAlertsBoardPulsePlan() {
        err(""); msg("Applying workspace alerts board pulse plan...");
        const rawTodo = (qs("#wsPulseTodoHours").value || "").trim();
        const rawDoing = (qs("#wsPulseDoingHours").value || "").trim();
        const rawBlocked = (qs("#wsPulseBlockedHours").value || "").trim();
        const todoHours = rawTodo ? Number(rawTodo) : undefined;
        const doingHours = rawDoing ? Number(rawDoing) : undefined;
        const blockedHours = rawBlocked ? Number(rawBlocked) : undefined;
        const policyOverride = qs("#wsPulsePolicyOverride").value;
        const limitItems = Number((qs("#wsPulseLimitItems").value || "").trim() || 20);
        const includeWarn = !!qs("#wsPulseIncludeWarn").checked;
        const dedupe = !!qs("#wsPulseDedupe").checked;
        const rawDedupeHours = (qs("#wsPulseDedupeWindowHours").value || "").trim();
        const dedupeWindowHours = rawDedupeHours ? Number(rawDedupeHours) : undefined;
        const dryRun = !!qs("#wsPulseDryRun").checked;
        const j = await apiPost("/ws/focus/alerts/board-pulse-apply", {
          limitBoards: 50,
          todoHours,
          doingHours,
          blockedHours,
          policy: policyOverride || undefined,
          limitItems,
          includeWarn,
          noLog: false,
          dedupe,
          dedupeWindowHours,
          dryRun
        });
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Board Pulse Applied";
      }

      async function loadWsAlertsBoardPolicy() {
        err(""); msg("Loading board policy defaults...");
        const j = await apiFetch("/ws/focus/alerts/board-policy", { accept: "application/json", json: true });
        if (j && j.policy) {
          qs("#wsPulsePolicyGlobal").value = j.policy.boardPulsePolicy;
          qs("#wsPulseDedupePolicyGlobal").value = j.policy.boardPulseDedupePolicy;
        }
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Board Policy";
      }

      async function saveWsAlertsBoardPolicy() {
        err(""); msg("Saving board policy defaults...");
        const boardPulsePolicy = qs("#wsPulsePolicyGlobal").value;
        const boardPulseDedupePolicy = qs("#wsPulseDedupePolicyGlobal").value;
        const j = await apiPost("/ws/focus/alerts/board-policy", { boardPulsePolicy, boardPulseDedupePolicy });
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Workspace Alerts Board Policy Saved";
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
        if (cfg.benchmarkAutoAdoptEnabled !== undefined) qs("#govBenchmarkAutoAdoptEnabled").checked = !!cfg.benchmarkAutoAdoptEnabled;
        if (cfg.governanceWindow !== undefined) qs("#govWindow").value = String(cfg.governanceWindow);
        if (cfg.governanceFailureRateHigh !== undefined) qs("#govFailureRateHigh").value = String(cfg.governanceFailureRateHigh);
        if (cfg.benchmarkAutoAdoptMinScore !== undefined) qs("#govBenchmarkMinScore").value = String(cfg.benchmarkAutoAdoptMinScore);
        if (cfg.benchmarkAutoAdoptMinGap !== undefined) qs("#govBenchmarkMinGap").value = String(cfg.benchmarkAutoAdoptMinGap);
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Embed Governance";
      }

      async function saveEmbedGovernance() {
        err(""); msg("Saving governance config...");
        const windowN = Number((qs("#govWindow").value || "").trim());
        const fr = Number((qs("#govFailureRateHigh").value || "").trim());
        const minScore = Number((qs("#govBenchmarkMinScore").value || "").trim());
        const minGap = Number((qs("#govBenchmarkMinGap").value || "").trim());
        const body = {
          governanceEnabled: !!qs("#govEnabled").checked,
          benchmarkAutoAdoptEnabled: !!qs("#govBenchmarkAutoAdoptEnabled").checked
        };
        if (Number.isFinite(windowN) && windowN > 0) body.governanceWindow = windowN;
        if (Number.isFinite(fr) && fr > 0 && fr <= 1) body.governanceFailureRateHigh = fr;
        if (Number.isFinite(minScore) && minScore >= 0 && minScore <= 100) body.benchmarkAutoAdoptMinScore = minScore;
        if (Number.isFinite(minGap) && minGap >= 0 && minGap <= 50) body.benchmarkAutoAdoptMinGap = minGap;
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

      async function simulateEmbedGovernance() {
        err(""); msg("Simulating governance policy...");
        const windowN = Number((qs("#govWindow").value || "").trim());
        const fr = Number((qs("#govFailureRateHigh").value || "").trim());
        const maxConcurrent = Number((qs("#embedJobsMaxConcurrent").value || "").trim());
        const retryTemplate = (qs("#embedRetryTemplate").value || "").trim().toLowerCase();
        const body = {
          mode: qs("#govSimMode").value || "recommend",
          assumeNoCooldown: true,
          governanceEnabled: !!qs("#govEnabled").checked
        };
        if (Number.isFinite(windowN) && windowN > 0) body.governanceWindow = windowN;
        if (Number.isFinite(fr) && fr > 0 && fr <= 1) body.governanceFailureRateHigh = fr;
        if (Number.isFinite(maxConcurrent) && maxConcurrent > 0) body.maxConcurrent = maxConcurrent;
        if (retryTemplate === "conservative" || retryTemplate === "balanced" || retryTemplate === "aggressive") body.retryTemplate = retryTemplate;
        const j = await apiPost("/embed/jobs/governance/simulate", body);
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Embed Governance Simulate";
      }

      async function benchmarkEmbedGovernance() {
        err(""); msg("Benchmarking governance strategies...");
        const body = {
          mode: qs("#govBenchMode").value || "apply_top",
          assumeNoCooldown: true
        };
        const j = await apiPost("/embed/jobs/governance/benchmark", body);
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Embed Governance Benchmark";
      }

      async function benchmarkAdoptEmbedGovernance() {
        err(""); msg("Benchmarking and adopting top candidate...");
        const body = {
          mode: qs("#govBenchMode").value || "apply_top",
          assumeNoCooldown: true,
          source: "ui"
        };
        const j = await apiPost("/embed/jobs/governance/benchmark/adopt", body);
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Embed Governance Benchmark Adopt";
      }

      async function loadEmbedGovernanceHistory() {
        err(""); msg("Loading governance history...");
        const j = await apiFetch("/embed/jobs/governance/history?limit=40", { accept: "application/json", json: true });
        const first = j && Array.isArray(j.versions) && j.versions.length ? j.versions[0] : null;
        if (first && first.id) qs("#govVersionId").value = first.id;
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Embed Governance History";
      }

      async function rollbackEmbedGovernance() {
        err(""); msg("Rolling back governance policy...");
        const versionId = (qs("#govVersionId").value || "").trim();
        if (!versionId) return msg("Missing governance version id.");
        const j = await apiPost("/embed/jobs/governance/rollback", { versionId, source: "ui" });
        out(JSON.stringify(j, null, 2));
        setTab("json");
        msg("OK");
        qs("#title").textContent = "Embed Governance Rollback";
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
          loadEmbedGovernanceHistory().catch(() => {});
          loadEmbedJobsConfig().catch(() => {});
        });
        evt.addEventListener("embed:jobs:governance:skip", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "embed:jobs:governance:skip"); }
        });
        evt.addEventListener("embed:jobs:governance:versioned", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "embed:jobs:governance:versioned"); }
          loadEmbedGovernanceHistory().catch(() => {});
        });
        evt.addEventListener("embed:jobs:governance:rollback", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "embed:jobs:governance:rollback"); }
          loadEmbedGovernance().catch(() => {});
          loadEmbedGovernanceHistory().catch(() => {});
          loadEmbedJobsConfig().catch(() => {});
        });
        evt.addEventListener("embed:jobs:benchmark:adopt", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "embed:jobs:benchmark:adopt"); }
          loadEmbedGovernance().catch(() => {});
          loadEmbedGovernanceHistory().catch(() => {});
          loadEmbedJobsConfig().catch(() => {});
        });
        evt.addEventListener("embed:jobs:benchmark:skip", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "embed:jobs:benchmark:skip"); }
        });
        evt.addEventListener("embed:jobs:config", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "embed:jobs:config"); }
          loadEmbedJobsConfig().catch(() => {});
        });
        evt.addEventListener("ws:alerts:incident", (ev) => {
          try {
            const j = JSON.parse(ev.data);
            pushLive(j);
            if (j && j.incidentId) qs("#wsIncidentId").value = String(j.incidentId);
          } catch {
            pushLive(ev.data || "ws:alerts:incident");
          }
        });
        evt.addEventListener("ws:alerts:action-applied", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "ws:alerts:action-applied"); }
          loadTodos().catch(() => {});
        });
        evt.addEventListener("ws:alerts:board-created", (ev) => {
          try {
            const j = JSON.parse(ev.data);
            pushLive(j);
            if (j && j.boardId) qs("#wsBoardId").value = String(j.boardId);
          } catch {
            pushLive(ev.data || "ws:alerts:board-created");
          }
        });
        evt.addEventListener("ws:alerts:board-updated", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "ws:alerts:board-updated"); }
        });
        evt.addEventListener("ws:alerts:board-closed", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "ws:alerts:board-closed"); }
        });
        evt.addEventListener("ws:alerts:board-pulse", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "ws:alerts:board-pulse"); }
        });
        evt.addEventListener("ws:alerts:board-pulse-applied", (ev) => {
          try { pushLive(JSON.parse(ev.data)); } catch { pushLive(ev.data || "ws:alerts:board-pulse-applied"); }
          loadTodos().catch(() => {});
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
      qs("#loadWsList").addEventListener("click", () => loadWsList().catch((e) => { err(String(e)); msg(""); }));
      qs("#doWsFocus").addEventListener("click", () => doWsFocus().catch((e) => { err(String(e)); msg(""); }));
      qs("#loadWsSnapshots").addEventListener("click", () => loadWsSnapshots().catch((e) => { err(String(e)); msg(""); }));
      qs("#doWsCompare").addEventListener("click", () => doWsCompare().catch((e) => { err(String(e)); msg(""); }));
      qs("#doWsReport").addEventListener("click", () => doWsReport().catch((e) => { err(String(e)); msg(""); }));
      qs("#loadWsReports").addEventListener("click", () => loadWsReports().catch((e) => { err(String(e)); msg(""); }));
      qs("#showWsReport").addEventListener("click", () => showWsReport().catch((e) => { err(String(e)); msg(""); }));
      qs("#loadWsTrends").addEventListener("click", () => loadWsTrends().catch((e) => { err(String(e)); msg(""); }));
      qs("#showWsTrend").addEventListener("click", () => showWsTrend().catch((e) => { err(String(e)); msg(""); }));
      qs("#loadWsAlerts").addEventListener("click", () => loadWsAlerts().catch((e) => { err(String(e)); msg(""); }));
      qs("#loadWsAlertsConfig").addEventListener("click", () => loadWsAlertsConfig().catch((e) => { err(String(e)); msg(""); }));
      qs("#saveWsAlertsConfig").addEventListener("click", () => saveWsAlertsConfig().catch((e) => { err(String(e)); msg(""); }));
      qs("#runWsAlertsAuto").addEventListener("click", () => runWsAlertsAuto().catch((e) => { err(String(e)); msg(""); }));
      qs("#loadWsAlertsHistory").addEventListener("click", () => loadWsAlertsHistory().catch((e) => { err(String(e)); msg(""); }));
      qs("#showWsAlertsRca").addEventListener("click", () => showWsAlertsRca().catch((e) => { err(String(e)); msg(""); }));
      qs("#showWsAlertsActionPlan").addEventListener("click", () => showWsAlertsActionPlan().catch((e) => { err(String(e)); msg(""); }));
      qs("#loadWsAlertsActionHistory").addEventListener("click", () => loadWsAlertsActionHistory().catch((e) => { err(String(e)); msg(""); }));
      qs("#showWsAlertsAction").addEventListener("click", () => showWsAlertsAction().catch((e) => { err(String(e)); msg(""); }));
      qs("#applyWsAlertsAction").addEventListener("click", () => applyWsAlertsAction().catch((e) => { err(String(e)); msg(""); }));
      qs("#loadWsAlertsBoards").addEventListener("click", () => loadWsAlertsBoards().catch((e) => { err(String(e)); msg(""); }));
      qs("#createWsAlertsBoard").addEventListener("click", () => createWsAlertsBoard().catch((e) => { err(String(e)); msg(""); }));
      qs("#showWsAlertsBoard").addEventListener("click", () => showWsAlertsBoard().catch((e) => { err(String(e)); msg(""); }));
      qs("#updateWsAlertsBoardItem").addEventListener("click", () => updateWsAlertsBoardItem().catch((e) => { err(String(e)); msg(""); }));
      qs("#showWsAlertsBoardReport").addEventListener("click", () => showWsAlertsBoardReport().catch((e) => { err(String(e)); msg(""); }));
      qs("#closeWsAlertsBoard").addEventListener("click", () => closeWsAlertsBoard().catch((e) => { err(String(e)); msg(""); }));
      qs("#runWsAlertsBoardPulse").addEventListener("click", () => runWsAlertsBoardPulse().catch((e) => { err(String(e)); msg(""); }));
      qs("#runWsAlertsBoardPulsePlan").addEventListener("click", () => runWsAlertsBoardPulsePlan().catch((e) => { err(String(e)); msg(""); }));
      qs("#applyWsAlertsBoardPulsePlan").addEventListener("click", () => applyWsAlertsBoardPulsePlan().catch((e) => { err(String(e)); msg(""); }));
      qs("#loadWsAlertsBoardPulseHistory").addEventListener("click", () => loadWsAlertsBoardPulseHistory().catch((e) => { err(String(e)); msg(""); }));
      qs("#loadWsAlertsBoardPolicy").addEventListener("click", () => loadWsAlertsBoardPolicy().catch((e) => { err(String(e)); msg(""); }));
      qs("#saveWsAlertsBoardPolicy").addEventListener("click", () => saveWsAlertsBoardPolicy().catch((e) => { err(String(e)); msg(""); }));
      qs("#loadWsAlertsActionJobs").addEventListener("click", () => loadWsAlertsActionJobs().catch((e) => { err(String(e)); msg(""); }));
      qs("#showWsAlertsActionJob").addEventListener("click", () => showWsAlertsActionJob().catch((e) => { err(String(e)); msg(""); }));
      qs("#pauseWsAlertsActionJob").addEventListener("click", () => pauseWsAlertsActionJob().catch((e) => { err(String(e)); msg(""); }));
      qs("#resumeWsAlertsActionJob").addEventListener("click", () => resumeWsAlertsActionJob().catch((e) => { err(String(e)); msg(""); }));
      qs("#cancelWsAlertsActionJob").addEventListener("click", () => cancelWsAlertsActionJob().catch((e) => { err(String(e)); msg(""); }));
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
      qs("#loadEmbedGovernanceHistory").addEventListener("click", () => loadEmbedGovernanceHistory().catch((e) => { err(String(e)); msg(""); }));
      qs("#simulateEmbedGovernance").addEventListener("click", () => simulateEmbedGovernance().catch((e) => { err(String(e)); msg(""); }));
      qs("#benchmarkEmbedGovernance").addEventListener("click", () => benchmarkEmbedGovernance().catch((e) => { err(String(e)); msg(""); }));
      qs("#benchmarkAdoptEmbedGovernance").addEventListener("click", () => benchmarkAdoptEmbedGovernance().catch((e) => { err(String(e)); msg(""); }));
      qs("#saveEmbedGovernance").addEventListener("click", () => saveEmbedGovernance().catch((e) => { err(String(e)); msg(""); }));
      qs("#applyEmbedGovernance").addEventListener("click", () => applyEmbedGovernance().catch((e) => { err(String(e)); msg(""); }));
      qs("#rollbackEmbedGovernance").addEventListener("click", () => rollbackEmbedGovernance().catch((e) => { err(String(e)); msg(""); }));
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
