export function parseChangelogHeadings(changelogText) {
  const text = String(changelogText || "");
  const lines = text.split("\n");
  const headings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^##\s+\[([^\]]+)\]/);
    if (!m) continue;
    const raw = String(m[1]).trim();
    const normalized = raw.replace(/^v/i, "").trim();
    headings.push({ line: i + 1, rawVersion: raw, normalizedVersion: normalized, heading: line });
  }
  return headings;
}

export function analyzeChangelog(changelogText) {
  const headings = parseChangelogHeadings(changelogText);
  const byVersion = new Map();
  const duplicates = [];
  const nonNormalized = [];

  for (const h of headings) {
    if (h.rawVersion !== h.normalizedVersion) {
      nonNormalized.push({ line: h.line, version: h.rawVersion });
    }
    const arr = byVersion.get(h.normalizedVersion) || [];
    arr.push(h);
    byVersion.set(h.normalizedVersion, arr);
  }
  for (const [v, arr] of byVersion) {
    if (arr.length > 1) {
      duplicates.push({ version: v, lines: arr.map((x) => x.line) });
    }
  }

  return {
    schema: 1,
    headingCount: headings.length,
    headings,
    duplicates,
    nonNormalized,
    ok: duplicates.length === 0 && nonNormalized.length === 0
  };
}
