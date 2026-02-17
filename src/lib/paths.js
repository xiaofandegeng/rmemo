import path from "node:path";

export function resolveRoot(flags) {
  const root = flags?.root ? String(flags.root) : process.cwd();
  return path.resolve(root);
}

export function memDir(root) {
  return path.join(root, ".repo-memory");
}

export function journalDir(root) {
  return path.join(memDir(root), "journal");
}

export function manifestPath(root) {
  return path.join(memDir(root), "manifest.json");
}

export function indexPath(root) {
  return path.join(memDir(root), "index.json");
}

export function rulesPath(root) {
  return path.join(memDir(root), "rules.md");
}

export function rulesJsonPath(root) {
  return path.join(memDir(root), "rules.json");
}

export function contextPath(root) {
  return path.join(memDir(root), "context.md");
}

export function todosPath(root) {
  return path.join(memDir(root), "todos.md");
}

export function configPath(root) {
  return path.join(memDir(root), "config.json");
}

export function handoffPath(root) {
  return path.join(memDir(root), "handoff.md");
}

export function prPath(root) {
  return path.join(memDir(root), "pr.md");
}

export function handoffJsonPath(root) {
  return path.join(memDir(root), "handoff.json");
}

export function prJsonPath(root) {
  return path.join(memDir(root), "pr.json");
}

export function wsSummaryPath(root) {
  return path.join(memDir(root), "ws.md");
}

export function wsFocusDir(root) {
  return path.join(memDir(root), "ws-focus");
}

export function wsFocusSnapshotsDir(root) {
  return path.join(wsFocusDir(root), "snapshots");
}

export function wsFocusIndexPath(root) {
  return path.join(wsFocusDir(root), "index.json");
}

export function wsFocusSnapshotPath(root, id) {
  return path.join(wsFocusSnapshotsDir(root), `${String(id)}.json`);
}

export function wsFocusReportsDir(root) {
  return path.join(wsFocusDir(root), "reports");
}

export function wsFocusReportsIndexPath(root) {
  return path.join(wsFocusReportsDir(root), "index.json");
}

export function wsFocusReportPath(root, id) {
  return path.join(wsFocusReportsDir(root), `${String(id)}.json`);
}

export function wsFocusAlertsConfigPath(root) {
  return path.join(wsFocusDir(root), "alerts.json");
}

export function wsFocusAlertsHistoryPath(root) {
  return path.join(wsFocusDir(root), "alerts-history.json");
}

export function wsFocusAlertsActionsDir(root) {
  return path.join(wsFocusDir(root), "actions");
}

export function wsFocusAlertsActionsIndexPath(root) {
  return path.join(wsFocusAlertsActionsDir(root), "index.json");
}

export function wsFocusAlertsActionPath(root, id) {
  return path.join(wsFocusAlertsActionsDir(root), `${String(id)}.json`);
}

export function sessionsDir(root) {
  return path.join(memDir(root), "sessions");
}

export function activeSessionPath(root) {
  return path.join(memDir(root), "session.json");
}

export function embeddingsDir(root) {
  return path.join(memDir(root), "embeddings");
}

export function embeddingsIndexPath(root) {
  return path.join(embeddingsDir(root), "index.json");
}

export function embeddingsMetaPath(root) {
  return path.join(embeddingsDir(root), "meta.json");
}
