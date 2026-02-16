import { buildEmbeddingsIndex } from "./embeddings.js";

function now() {
  return new Date().toISOString();
}

export function createEmbedJobsController(root, { events, maxHistory = 50 } = {}) {
  const queue = [];
  const history = [];
  const active = new Map();
  let seq = 0;
  const config = {
    maxConcurrent: 1
  };
  const stats = {
    queued: 0,
    started: 0,
    succeeded: 0,
    failed: 0,
    canceled: 0,
    retried: 0
  };

  function toPriority(v) {
    const s = String(v ?? "normal").toLowerCase();
    if (s === "high" || s === "2") return 2;
    if (s === "low" || s === "0") return 0;
    return 1;
  }

  function priorityName(n) {
    if (n >= 2) return "high";
    if (n <= 0) return "low";
    return "normal";
  }

  function classifyError(err) {
    const msg = String(err?.message || err || "").toLowerCase();
    if (!msg) return "unknown";
    if (msg.includes("abort") || msg.includes("canceled")) return "canceled";
    if (msg.includes("401") || msg.includes("403") || msg.includes("api key") || msg.includes("unauthorized")) return "auth";
    if (msg.includes("429") || msg.includes("rate limit")) return "rate_limit";
    if (msg.includes("econn") || msg.includes("network") || msg.includes("fetch") || msg.includes("timeout")) return "network";
    if (msg.includes("missing") || msg.includes("unknown provider") || msg.includes("invalid")) return "config";
    return "runtime";
  }

  function isRetryable(classification) {
    return classification === "network" || classification === "rate_limit";
  }

  function snapshotJob(j) {
    if (!j) return null;
    return {
      id: j.id,
      status: j.status,
      createdAt: j.createdAt,
      startedAt: j.startedAt || null,
      finishedAt: j.finishedAt || null,
      trigger: j.trigger || "api",
      reason: j.reason || "",
      priority: j.priority || "normal",
      attempts: Number(j.attempts || 0),
      maxRetries: Number(j.maxRetries || 0),
      retryDelayMs: Number(j.retryDelayMs || 0),
      retryAt: j.retryAt || null,
      params: j.params || {},
      progress: j.progress || null,
      resultMeta: j.resultMeta || null,
      errorClass: j.errorClass || null,
      error: j.error || null
    };
  }

  function snapshot() {
    const activeJobs = Array.from(active.values())
      .sort((a, b) => (a.startedAt || "").localeCompare(b.startedAt || ""))
      .map(snapshotJob);
    return {
      schema: 1,
      generatedAt: now(),
      config: { ...config },
      stats: { ...stats },
      active: activeJobs[0] || null,
      activeJobs,
      queued: queue.map(snapshotJob),
      history: history.map(snapshotJob)
    };
  }

  function addHistory(j) {
    history.unshift(j);
    while (history.length > maxHistory) history.pop();
  }

  async function runNext() {
    while (active.size < Math.max(1, Number(config.maxConcurrent || 1)) && queue.length) {
      const job = queue.shift();
      active.set(job.id, job);
      job.status = "running";
      job.startedAt = now();
      job.retryAt = null;
      job.attempts = Number(job.attempts || 0) + 1;
      job.abort = new AbortController();
      stats.started += 1;
      events?.emit?.({
        type: "embed:job:start",
        jobId: job.id,
        trigger: job.trigger || "api",
        attempts: job.attempts,
        maxRetries: job.maxRetries,
        priority: job.priority
      });

      void (async () => {
        try {
          const built = await buildEmbeddingsIndex(root, {
            ...(job.params || {}),
            signal: job.abort.signal,
            onProgress: (p) => {
              job.progress = p;
              events?.emit?.({ type: "embed:job:progress", jobId: job.id, ...p });
            }
          });
          job.status = "ok";
          job.finishedAt = now();
          job.resultMeta = built.meta;
          stats.succeeded += 1;
          events?.emit?.({
            type: "embed:job:ok",
            jobId: job.id,
            provider: built?.meta?.provider,
            embeddedItems: built?.meta?.embeddedItems,
            reusedItems: built?.meta?.reusedItems,
            elapsedMs: built?.meta?.elapsedMs
          });
          const done = job;
          delete done.abort;
          addHistory(done);
        } catch (e) {
          const msg = e?.message || String(e);
          const errorClass = classifyError(e);
          const aborted = !!job.abort?.signal?.aborted;
          job.error = msg;
          job.errorClass = errorClass;
          job.finishedAt = now();
          if (aborted) {
            job.status = "canceled";
            stats.canceled += 1;
            events?.emit?.({ type: "embed:job:canceled", jobId: job.id, error: msg, errorClass });
            const done = job;
            delete done.abort;
            addHistory(done);
          } else if (isRetryable(errorClass) && Number(job.attempts || 0) <= Number(job.maxRetries || 0)) {
            job.status = "retry_wait";
            stats.retried += 1;
            const delay = Math.max(0, Number(job.retryDelayMs || 0));
            job.retryAt = new Date(Date.now() + delay).toISOString();
            events?.emit?.({
              type: "embed:job:retry",
              jobId: job.id,
              error: msg,
              errorClass,
              attempts: job.attempts,
              maxRetries: job.maxRetries,
              retryAt: job.retryAt
            });
            setTimeout(() => {
              job.status = "queued";
              job.startedAt = null;
              job.finishedAt = null;
              const pos = queue.findIndex((x) => toPriority(x.priority) < toPriority(job.priority));
              if (pos === -1) queue.push(job);
              else queue.splice(pos, 0, job);
              events?.emit?.({ type: "embed:job:queued", jobId: job.id, trigger: job.trigger || "api", queueSize: queue.length, priority: job.priority });
              void runNext();
            }, delay).unref?.();
          } else {
            job.status = "error";
            stats.failed += 1;
            events?.emit?.({ type: "embed:job:err", jobId: job.id, error: msg, errorClass });
            const done = job;
            delete done.abort;
            addHistory(done);
          }
        } finally {
          active.delete(job.id);
          void runNext();
        }
      })();
    }
  }

  function enqueue(params = {}, { trigger = "api", reason = "", priority = "normal", maxRetries = 1, retryDelayMs = 1000 } = {}) {
    const pName = priorityName(toPriority(priority));
    const job = {
      id: `ej_${Date.now()}_${++seq}`,
      status: "queued",
      createdAt: now(),
      trigger,
      reason,
      priority: pName,
      attempts: 0,
      maxRetries: Math.max(0, Number(maxRetries || 0)),
      retryDelayMs: Math.max(0, Number(retryDelayMs || 0)),
      params,
      progress: null
    };
    const pos = queue.findIndex((x) => toPriority(x.priority) < toPriority(job.priority));
    if (pos === -1) queue.push(job);
    else queue.splice(pos, 0, job);
    stats.queued += 1;
    events?.emit?.({ type: "embed:job:queued", jobId: job.id, trigger, queueSize: queue.length, priority: job.priority });
    void runNext();
    return snapshotJob(job);
  }

  function getJob(jobId) {
    if (active.has(jobId)) return snapshotJob(active.get(jobId));
    const q = queue.find((j) => j.id === jobId);
    if (q) return snapshotJob(q);
    const h = history.find((j) => j.id === jobId);
    if (h) return snapshotJob(h);
    return null;
  }

  function cancel(jobId) {
    if (active.has(jobId)) {
      const j = active.get(jobId);
      try {
        j.abort?.abort();
      } catch {
        // ignore
      }
      j.status = "canceling";
      return { ok: true, id: jobId, state: "canceling" };
    }
    const i = queue.findIndex((j) => j.id === jobId);
    if (i !== -1) {
      const [j] = queue.splice(i, 1);
      j.status = "canceled";
      j.finishedAt = now();
      j.error = "canceled before start";
      stats.canceled += 1;
      addHistory(j);
      events?.emit?.({ type: "embed:job:canceled", jobId: j.id, error: j.error });
      return { ok: true, id: jobId, state: "canceled" };
    }
    return { ok: false, id: jobId, error: "job_not_found" };
  }

  function setConfig(partial = {}) {
    if (partial.maxConcurrent !== undefined) {
      const n = Number(partial.maxConcurrent);
      if (!Number.isFinite(n) || n < 1 || n > 8) {
        throw new Error("maxConcurrent must be an integer in [1,8]");
      }
      config.maxConcurrent = Math.floor(n);
    }
    events?.emit?.({ type: "embed:jobs:config", config: { ...config } });
    void runNext();
    return { ...config };
  }

  function getConfig() {
    return { ...config };
  }

  return {
    enqueue,
    status: snapshot,
    getJob,
    cancel,
    setConfig,
    getConfig
  };
}
