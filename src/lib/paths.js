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
