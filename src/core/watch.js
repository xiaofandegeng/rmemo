import fs from "node:fs/promises";
import path from "node:path";
import { fileExists, writeJson } from "../lib/io.js";
import { contextPath, indexPath, manifestPath } from "../lib/paths.js";
import { ensureRepoMemory } from "./memory.js";
import { scanRepo } from "./scan.js";
import { generateContext } from "./context.js";
import { syncAiInstructions } from "./sync.js";
import { getGitSummary, gitOk, revParse } from "./git_summary.js";
import { embedAuto } from "./embed_auto.js";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function stableSig(parts) {
  return parts.map((x) => String(x || "")).join("\n");
}

async function computeSignature(root, { preferGit }) {
  const useGit = preferGit && (await gitOk(root));
  if (useGit) {
    const head = await revParse(root, "HEAD").catch(() => "");
    const git = await getGitSummary(root, { staged: false });
    return {
      usingGit: true,
      sig: stableSig([head, git?.status || "", git?.diffNames || ""])
    };
  }

  // Fallback: watch `.repo-memory/` only (cheap and predictable).
  const p = path.join(root, ".repo-memory");
  let stamp = "";
  try {
    const st = await fs.stat(p);
    stamp = String(st.mtimeMs);
  } catch {
    stamp = "";
  }
  return { usingGit: false, sig: stamp };
}

export async function refreshRepoMemory(root, { preferGit, maxFiles, snipLines, recentDays, sync, embed } = {}) {
  await ensureRepoMemory(root);
  const { manifest, index } = await scanRepo(root, { maxFiles, preferGit });
  await writeJson(manifestPath(root), manifest);
  await writeJson(indexPath(root), index);

  const ctx = await generateContext(root, { snipLines, recentDays });
  await fs.writeFile(contextPath(root), ctx, "utf8");

  if (sync) await syncAiInstructions({ root });
  if (embed) await embedAuto(root, { checkOnly: false });

  return { schema: 1, generatedAt: nowIso(), root, manifest };
}

export async function watchRepo(root, opts = {}) {
  const {
    preferGit = true,
    maxFiles = 4000,
    snipLines = 120,
    recentDays = 7,
    intervalMs = 2000,
    once = false,
    sync = true,
    embed = false,
    signal = null,
    noSignals = false,
    onEvent = null
  } = opts;

  const emit = (e) => {
    if (typeof onEvent === "function") onEvent({ at: nowIso(), ...e });
  };

  const initSig = await computeSignature(root, { preferGit });
  let last = initSig.sig;
  emit({ type: "start", usingGit: initSig.usingGit, intervalMs, sync, embed });

  const runRefresh = async (reason) => {
    emit({ type: "refresh:start", reason });
    try {
      const r = await refreshRepoMemory(root, { preferGit, maxFiles, snipLines, recentDays, sync, embed });
      emit({ type: "refresh:ok", reason, generatedAt: r.generatedAt });
    } catch (err) {
      emit({ type: "refresh:err", reason, error: err?.message || String(err) });
    }
  };

  // Always do an initial refresh if context is missing.
  if (!(await fileExists(contextPath(root)))) {
    await runRefresh("initial-missing-context");
  } else {
    emit({ type: "idle", reason: "initial" });
  }

  if (once) {
    const sig2 = await computeSignature(root, { preferGit });
    if (sig2.sig !== last) {
      last = sig2.sig;
      await runRefresh("changed");
    }
    emit({ type: "stop", reason: "once" });
    return;
  }

  // Loop until SIGINT/SIGTERM triggers a stop.
  let stopped = false;
  const stop = (reason) => {
    if (stopped) return;
    stopped = true;
    emit({ type: "stop", reason });
  };
  if (!noSignals) {
    process.on("SIGINT", () => stop("SIGINT"));
    process.on("SIGTERM", () => stop("SIGTERM"));
  }
  if (signal) {
    if (signal.aborted) stop("aborted");
    else signal.addEventListener("abort", () => stop("aborted"), { once: true });
  }

  while (!stopped) {
    // eslint-disable-next-line no-await-in-loop
    await sleep(Math.max(200, intervalMs));
    // eslint-disable-next-line no-await-in-loop
    const sig = await computeSignature(root, { preferGit });
    if (sig.sig !== last) {
      last = sig.sig;
      // eslint-disable-next-line no-await-in-loop
      await runRefresh("changed");
    } else {
      emit({ type: "idle", reason: "no-change" });
    }
  }
}
