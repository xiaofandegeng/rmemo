import { buildEmbeddingsIndex } from "./embeddings.js";

function now() {
  return new Date().toISOString();
}

const RETRY_TEMPLATES = Object.freeze({
  conservative: {
    maxRetries: 1,
    strategy: "fixed",
    retryDelayMs: 1500,
    maxDelayMs: 1500,
    backoffMultiplier: 1,
    jitterRatio: 0
  },
  balanced: {
    maxRetries: 2,
    strategy: "exponential",
    retryDelayMs: 800,
    maxDelayMs: 6000,
    backoffMultiplier: 2,
    jitterRatio: 0.15
  },
  aggressive: {
    maxRetries: 4,
    strategy: "exponential",
    retryDelayMs: 500,
    maxDelayMs: 8000,
    backoffMultiplier: 1.8,
    jitterRatio: 0.25
  }
});

export function createEmbedJobsController(root, { events, maxHistory = 50 } = {}) {
  const queue = [];
  const history = [];
  const active = new Map();
  let seq = 0;
  const config = {
    maxConcurrent: 1,
    retryTemplate: "balanced",
    defaultPriority: "normal"
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

  function normalizeTemplateName(v) {
    const s = String(v || "").trim().toLowerCase();
    return RETRY_TEMPLATES[s] ? s : "balanced";
  }

  function cloneTemplateByName(name) {
    const n = normalizeTemplateName(name);
    const t = RETRY_TEMPLATES[n];
    return { name: n, ...t };
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

  function normalizeErrorMessage(msg) {
    return String(msg || "")
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, "<url>")
      .replace(/['"`].{1,80}['"`]/g, "<quoted>")
      .replace(/[a-f0-9]{8,}/g, "<id>")
      .replace(/\b\d+\b/g, "<n>")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180);
  }

  function getFailureClusters({ limit = 20, errorClass = "" } = {}) {
    const wanted = String(errorClass || "").trim().toLowerCase();
    const m = new Map();
    for (const j of history) {
      if (j.status !== "error") continue;
      if (wanted && String(j.errorClass || "").toLowerCase() !== wanted) continue;
      const cls = j.errorClass || "unknown";
      const sig = normalizeErrorMessage(j.error || "");
      const key = `${cls}:${sig || "<empty>"}`;
      const old = m.get(key);
      if (!old) {
        m.set(key, {
          key,
          errorClass: cls,
          signature: sig || "<empty>",
          count: 1,
          lastAt: j.finishedAt || j.startedAt || j.createdAt || null,
          sampleError: j.error || "",
          sampleJobId: j.id
        });
      } else {
        old.count += 1;
        const at = j.finishedAt || j.startedAt || j.createdAt || null;
        if (!old.lastAt || (at && at > old.lastAt)) {
          old.lastAt = at;
          old.sampleError = j.error || old.sampleError;
          old.sampleJobId = j.id || old.sampleJobId;
        }
      }
    }
    return Array.from(m.values())
      .sort((a, b) => (b.count - a.count) || String(b.lastAt || "").localeCompare(String(a.lastAt || "")))
      .slice(0, Math.max(1, Number(limit || 20)));
  }

  function normalizeRetryPolicy(input = {}) {
    const strategy = String(input.strategy || "fixed").toLowerCase() === "exponential" ? "exponential" : "fixed";
    const retryDelayMs = Math.max(0, Number(input.retryDelayMs || 0));
    const maxDelayMs = Math.max(retryDelayMs, Number(input.maxDelayMs || retryDelayMs || 0));
    const backoffMultiplier = Math.max(1, Number(input.backoffMultiplier || 1));
    const jitterRatio = Math.min(0.9, Math.max(0, Number(input.jitterRatio || 0)));
    const maxRetries = Math.max(0, Math.floor(Number(input.maxRetries || 0)));
    return { strategy, retryDelayMs, maxDelayMs, backoffMultiplier, jitterRatio, maxRetries };
  }

  function resolveRetryPolicy(opts = {}) {
    const templateName = normalizeTemplateName(opts.retryTemplate || config.retryTemplate);
    const fromTemplate = cloneTemplateByName(templateName);
    return {
      template: fromTemplate.name,
      ...normalizeRetryPolicy({
        strategy: opts.retryStrategy ?? opts.strategy ?? fromTemplate.strategy,
        retryDelayMs: opts.retryDelayMs ?? fromTemplate.retryDelayMs,
        maxDelayMs: opts.maxDelayMs ?? fromTemplate.maxDelayMs,
        backoffMultiplier: opts.backoffMultiplier ?? fromTemplate.backoffMultiplier,
        jitterRatio: opts.jitterRatio ?? fromTemplate.jitterRatio,
        maxRetries: opts.maxRetries ?? fromTemplate.maxRetries
      })
    };
  }

  function computeRetryDelayMs(policy, attempts) {
    const p = normalizeRetryPolicy(policy || {});
    let delay = p.retryDelayMs;
    if (p.strategy === "exponential") {
      const n = Math.max(0, Number(attempts || 1) - 1);
      delay = p.retryDelayMs * Math.pow(p.backoffMultiplier, n);
    }
    delay = Math.min(delay, p.maxDelayMs || delay);
    if (p.jitterRatio > 0) {
      const f = 1 + ((Math.random() * 2 - 1) * p.jitterRatio);
      delay = delay * f;
    }
    return Math.max(0, Math.round(delay));
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
      retryPolicy: j.retryPolicy || null,
      sourceJobId: j.sourceJobId || null,
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
      retryTemplates: RETRY_TEMPLATES,
      stats: { ...stats },
      active: activeJobs[0] || null,
      activeJobs,
      queued: queue.map(snapshotJob),
      history: history.map(snapshotJob),
      failures: getFailureClusters({ limit: 10 })
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
            const delay = computeRetryDelayMs(job.retryPolicy, Number(job.attempts || 0));
            job.retryAt = new Date(Date.now() + delay).toISOString();
            events?.emit?.({
              type: "embed:job:retry",
              jobId: job.id,
              error: msg,
              errorClass,
              attempts: job.attempts,
              maxRetries: job.maxRetries,
              retryPolicy: job.retryPolicy,
              retryDelayMs: delay,
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

  function enqueue(
    params = {},
    {
      trigger = "api",
      reason = "",
      priority = config.defaultPriority || "normal",
      maxRetries,
      retryDelayMs,
      retryTemplate,
      retryStrategy,
      maxDelayMs,
      backoffMultiplier,
      jitterRatio,
      sourceJobId = ""
    } = {}
  ) {
    const retryPolicy = resolveRetryPolicy({
      maxRetries,
      retryDelayMs,
      retryTemplate,
      retryStrategy,
      maxDelayMs,
      backoffMultiplier,
      jitterRatio
    });
    const pName = priorityName(toPriority(priority));
    const job = {
      id: `ej_${Date.now()}_${++seq}`,
      status: "queued",
      createdAt: now(),
      trigger,
      reason,
      priority: pName,
      attempts: 0,
      maxRetries: retryPolicy.maxRetries,
      retryDelayMs: retryPolicy.retryDelayMs,
      retryPolicy,
      sourceJobId: sourceJobId ? String(sourceJobId) : "",
      params,
      progress: null
    };
    const pos = queue.findIndex((x) => toPriority(x.priority) < toPriority(job.priority));
    if (pos === -1) queue.push(job);
    else queue.splice(pos, 0, job);
    stats.queued += 1;
    events?.emit?.({
      type: "embed:job:queued",
      jobId: job.id,
      trigger,
      queueSize: queue.length,
      priority: job.priority,
      retryPolicy: job.retryPolicy,
      sourceJobId: job.sourceJobId || null
    });
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
    if (partial.retryTemplate !== undefined) {
      const raw = String(partial.retryTemplate || "").trim().toLowerCase();
      if (!RETRY_TEMPLATES[raw]) throw new Error("retryTemplate must be one of: conservative, balanced, aggressive");
      config.retryTemplate = raw;
    }
    if (partial.defaultPriority !== undefined) {
      const p = priorityName(toPriority(partial.defaultPriority));
      config.defaultPriority = p;
    }
    events?.emit?.({ type: "embed:jobs:config", config: { ...config } });
    void runNext();
    return { ...config };
  }

  function getConfig() {
    return { ...config };
  }

  function retryJob(jobId, { priority, retryTemplate, retryStrategy, maxRetries, retryDelayMs, maxDelayMs, backoffMultiplier, jitterRatio } = {}) {
    const source = history.find((j) => j.id === jobId);
    if (!source) return { ok: false, id: jobId, error: "job_not_found" };
    if (source.status !== "error" && source.status !== "canceled") {
      return { ok: false, id: jobId, error: "job_not_retryable_status" };
    }
    const job = enqueue(
      { ...(source.params || {}) },
      {
        trigger: "retry",
        reason: `retry:${source.id}`,
        sourceJobId: source.id,
        priority: priority || source.priority || config.defaultPriority,
        retryTemplate: retryTemplate || source.retryPolicy?.template || config.retryTemplate,
        retryStrategy: retryStrategy || source.retryPolicy?.strategy,
        maxRetries: maxRetries ?? source.maxRetries,
        retryDelayMs: retryDelayMs ?? source.retryDelayMs,
        maxDelayMs: maxDelayMs ?? source.retryPolicy?.maxDelayMs,
        backoffMultiplier: backoffMultiplier ?? source.retryPolicy?.backoffMultiplier,
        jitterRatio: jitterRatio ?? source.retryPolicy?.jitterRatio
      }
    );
    events?.emit?.({ type: "embed:job:requeued", sourceJobId: source.id, jobId: job.id });
    return { ok: true, sourceJobId: source.id, job };
  }

  function retryFailed({ limit = 5, errorClass = "", clusterKey = "", priority, retryTemplate } = {}) {
    const cap = Math.max(1, Math.min(50, Number(limit || 5)));
    const cls = String(errorClass || "").trim().toLowerCase();
    const ckey = String(clusterKey || "").trim();
    const picked = [];
    for (const j of history) {
      if (picked.length >= cap) break;
      if (j.status !== "error") continue;
      if (cls && String(j.errorClass || "").toLowerCase() !== cls) continue;
      if (ckey) {
        const key = `${j.errorClass || "unknown"}:${normalizeErrorMessage(j.error || "") || "<empty>"}`;
        if (key !== ckey) continue;
      }
      picked.push(j);
    }
    const retried = [];
    for (const j of picked) {
      const r = retryJob(j.id, { priority, retryTemplate });
      if (r.ok) retried.push({ sourceJobId: j.id, jobId: r.job.id });
    }
    events?.emit?.({
      type: "embed:jobs:retry-failed",
      requestedLimit: cap,
      retriedCount: retried.length,
      errorClass: cls || null,
      clusterKey: ckey || null
    });
    return {
      ok: true,
      retried,
      requestedLimit: cap,
      matched: picked.length,
      errorClass: cls || null,
      clusterKey: ckey || null
    };
  }

  return {
    enqueue,
    status: snapshot,
    getJob,
    cancel,
    setConfig,
    getConfig,
    getFailureClusters,
    retryJob,
    retryFailed,
    retryTemplates: () => ({ ...RETRY_TEMPLATES })
  };
}
