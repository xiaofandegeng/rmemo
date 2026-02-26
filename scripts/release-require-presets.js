export const REQUIRED_FILE_PRESETS = Object.freeze({
  "rehearsal-archive-verify": Object.freeze([
    "release-ready.json",
    "release-health.json",
    "release-rehearsal.json",
    "release-summary.json"
  ])
});

export function listRequirePresets() {
  return Object.entries(REQUIRED_FILE_PRESETS).map(([name, files]) => ({
    name,
    files: Array.isArray(files) ? files.slice() : []
  }));
}

export function getRequirePresetFiles(name) {
  const key = String(name || "").trim();
  const files = REQUIRED_FILE_PRESETS[key];
  return Array.isArray(files) ? files.slice() : null;
}
