export function extractReleaseNotesFromChangelog(changelogText, version) {
  const text = String(changelogText || "");
  const v = String(version || "").replace(/^v/i, "").trim();
  if (!v) return null;
  const lines = text.split("\n");
  const heads = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^##\s+\[?v?([0-9][0-9A-Za-z.\-_]*)\]?/);
    if (!m) continue;
    heads.push({ i, raw: line, version: String(m[1]) });
  }
  const at = heads.find((h) => h.version === v);
  if (!at) return null;
  const next = heads.find((h) => h.i > at.i);
  const start = at.i;
  const end = next ? next.i : lines.length;
  const body = lines.slice(start, end).join("\n").trim();
  return body || null;
}

export function buildReleaseNotesMarkdown({ version, changelogSection }) {
  const v = String(version || "").replace(/^v/i, "").trim();
  const sec = String(changelogSection || "").trim();
  const lines = [];
  lines.push(`## ${v ? `v${v}` : "Release"}`);
  lines.push("");
  if (sec) {
    lines.push(sec);
  } else {
    lines.push("- No detailed changelog section found for this version.");
  }
  return lines.join("\n").trimEnd() + "\n";
}
