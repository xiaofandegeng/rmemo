function normalizePackageName(packageName) {
  return String(packageName || "").trim();
}

export function deriveReleaseAssetNames({ packageName, version }) {
  const normalizedPackageName = normalizePackageName(packageName);
  const normalizedVersion = String(version || "").trim();

  if (!normalizedPackageName) throw new Error("packageName is required");
  if (!normalizedVersion) throw new Error("version is required");

  const packageBaseName = normalizedPackageName.includes("/")
    ? normalizedPackageName.split("/").pop()
    : normalizedPackageName;
  const unscopedName = normalizedPackageName.startsWith("@")
    ? normalizedPackageName.slice(1)
    : normalizedPackageName;
  const scopedPackBaseName = unscopedName.replace(/\//g, "-");
  const scopedPackFile = `${scopedPackBaseName}-${normalizedVersion}.tgz`;
  const expectedAsset = `${packageBaseName}-${normalizedVersion}.tgz`;

  return {
    packageName: normalizedPackageName,
    packageBaseName,
    version: normalizedVersion,
    scopedPackFile,
    expectedAsset
  };
}
