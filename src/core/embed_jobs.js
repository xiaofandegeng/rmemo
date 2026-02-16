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
    defaultPriority: "normal",
    governanceEnabled: false,
    governanceWindow: 20,
    governanceMinSample: 6,
    governanceFailureRateHigh: 0.5,
    governanceCooldownMs: 60_000,
    governanceAutoScaleConcurrency: true,
    governanceAutoSwitchTemplate: true
  };
  const governance = {
    lastEvaluatedAt: null,
    lastActionAt: null,
    lastAction: null,
    history: [],
    policySeq: 0,
    policyVersions: []
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
      failures: getFailureClusters({ limit: 10 }),
      governance: getGovernanceReport()
    };
  }

  function policyConfigSnapshot(cfg = config) {
    return {
      maxConcurrent: cfg.maxConcurrent,
      retryTemplate: cfg.retryTemplate,
      defaultPriority: cfg.defaultPriority,
      governanceEnabled: cfg.governanceEnabled,
      governanceWindow: cfg.governanceWindow,
      governanceMinSample: cfg.governanceMinSample,
      governanceFailureRateHigh: cfg.governanceFailureRateHigh,
      governanceCooldownMs: cfg.governanceCooldownMs,
      governanceAutoScaleConcurrency: cfg.governanceAutoScaleConcurrency,
      governanceAutoSwitchTemplate: cfg.governanceAutoSwitchTemplate
    };
  }

  function buildConfigFrom(base, partial = {}) {
    const next = { ...base };
    if (partial.maxConcurrent !== undefined) {
      const n = Number(partial.maxConcurrent);
      if (!Number.isFinite(n) || n < 1 || n > 8) throw new Error("maxConcurrent must be an integer in [1,8]");
      next.maxConcurrent = Math.floor(n);
    }
    if (partial.retryTemplate !== undefined) {
      const raw = String(partial.retryTemplate || "").trim().toLowerCase();
      if (!RETRY_TEMPLATES[raw]) throw new Error("retryTemplate must be one of: conservative, balanced, aggressive");
      next.retryTemplate = raw;
    }
    if (partial.defaultPriority !== undefined) {
      next.defaultPriority = priorityName(toPriority(partial.defaultPriority));
    }
    if (partial.governanceEnabled !== undefined) next.governanceEnabled = !!partial.governanceEnabled;
    if (partial.governanceWindow !== undefined) {
      const n = Number(partial.governanceWindow);
      if (!Number.isFinite(n) || n < 5 || n > 200) throw new Error("governanceWindow must be in [5,200]");
      next.governanceWindow = Math.floor(n);
    }
    if (partial.governanceMinSample !== undefined) {
      const n = Number(partial.governanceMinSample);
      if (!Number.isFinite(n) || n < 3 || n > 100) throw new Error("governanceMinSample must be in [3,100]");
      next.governanceMinSample = Math.floor(n);
    }
    if (partial.governanceFailureRateHigh !== undefined) {
      const n = Number(partial.governanceFailureRateHigh);
      if (!Number.isFinite(n) || n < 0.1 || n > 1) throw new Error("governanceFailureRateHigh must be in [0.1,1]");
      next.governanceFailureRateHigh = n;
    }
    if (partial.governanceCooldownMs !== undefined) {
      const n = Number(partial.governanceCooldownMs);
      if (!Number.isFinite(n) || n < 0 || n > 3_600_000) throw new Error("governanceCooldownMs must be in [0,3600000]");
      next.governanceCooldownMs = Math.floor(n);
    }
    if (partial.governanceAutoScaleConcurrency !== undefined) next.governanceAutoScaleConcurrency = !!partial.governanceAutoScaleConcurrency;
    if (partial.governanceAutoSwitchTemplate !== undefined) next.governanceAutoSwitchTemplate = !!partial.governanceAutoSwitchTemplate;
    const changedKeys = Object.keys(next).filter((k) => next[k] !== base[k]);
    return { next, changedKeys };
  }

  function maybeCreatePolicyVersion({ source = "system", reason = "", changedKeys = [] } = {}) {
    const cur = policyConfigSnapshot();
    const curStr = JSON.stringify(cur);
    const last = governance.policyVersions[0];
    const lastStr = last ? JSON.stringify(last.config || {}) : "";
    if (last && lastStr === curStr) return null;
    const v = {
      id: `gv_${Date.now()}_${++governance.policySeq}`,
      at: now(),
      source: String(source || "system"),
      reason: String(reason || ""),
      changedKeys: Array.isArray(changedKeys) ? changedKeys.slice(0, 30) : [],
      config: cur
    };
    governance.policyVersions.unshift(v);
    while (governance.policyVersions.length > 80) governance.policyVersions.pop();
    events?.emit?.({
      type: "embed:jobs:governance:versioned",
      versionId: v.id,
      source: v.source,
      reason: v.reason,
      changedKeys: v.changedKeys
    });
    return v;
  }

  function listPolicyVersions({ limit = 20 } = {}) {
    const cap = Math.max(1, Math.min(200, Number(limit || 20)));
    return governance.policyVersions.slice(0, cap);
  }

  function pushGovernanceAction(action) {
    governance.lastActionAt = action.at;
    governance.lastAction = action;
    governance.history.unshift(action);
    while (governance.history.length > 40) governance.history.pop();
  }

  function listRecentFinishedJobs(limit = 20) {
    const out = [];
    const cap = Math.max(1, Number(limit || 20));
    for (const j of history) {
      if (j.status !== "ok" && j.status !== "error" && j.status !== "canceled") continue;
      out.push(j);
      if (out.length >= cap) break;
    }
    return out;
  }

  function getGovernanceRecommendations(report, cfg = config) {
    const recs = [];
    const total = Number(report?.metrics?.sample || 0);
    const failureRate = Number(report?.metrics?.failureRate || 0);
    const byClass = report?.metrics?.errorClassCounts || {};
    const clusters = Array.isArray(report?.topFailures) ? report.topFailures : [];
    const top = clusters[0] || null;

    if (total >= cfg.governanceMinSample && failureRate >= cfg.governanceFailureRateHigh) {
      if ((byClass.rate_limit || 0) >= 2 || (top && top.errorClass === "rate_limit" && top.count >= 2)) {
        recs.push({
          code: "throttle_rate_limit",
          priority: 100,
          reason: `rate_limit failures are dominant (${byClass.rate_limit || 0}/${total})`,
          action: { maxConcurrent: 1, retryTemplate: "conservative" }
        });
      } else if ((byClass.network || 0) >= 2 || (top && top.errorClass === "network" && top.count >= 2)) {
        recs.push({
          code: "stabilize_network",
          priority: 90,
          reason: `network failures are dominant (${byClass.network || 0}/${total})`,
          action: { retryTemplate: "conservative" }
        });
      } else if ((byClass.auth || 0) >= 1 || (byClass.config || 0) >= 1) {
        recs.push({
          code: "protect_invalid_config",
          priority: 110,
          reason: `auth/config errors detected (auth=${byClass.auth || 0}, config=${byClass.config || 0})`,
          action: { maxConcurrent: 1, retryTemplate: "conservative" }
        });
      } else {
        recs.push({
          code: "degrade_general",
          priority: 80,
          reason: `high failure rate (${Math.round(failureRate * 100)}%)`,
          action: { retryTemplate: "balanced" }
        });
      }
    }

    if (total >= cfg.governanceMinSample && failureRate <= 0.15 && (byClass.rate_limit || 0) === 0 && (byClass.network || 0) === 0) {
      if (cfg.maxConcurrent < 3) {
        recs.push({
          code: "scale_up_healthy",
          priority: 40,
          reason: `healthy recent window (${Math.round(failureRate * 100)}% failures)`,
          action: { maxConcurrent: Math.min(3, Number(cfg.maxConcurrent || 1) + 1) }
        });
      }
      if (cfg.retryTemplate === "conservative") {
        recs.push({
          code: "restore_balanced_retry",
          priority: 30,
          reason: "healthy window; conservative retry can be relaxed",
          action: { retryTemplate: "balanced" }
        });
      }
    }

    return recs.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
  }

  function getGovernanceReport({ config: reportConfig } = {}) {
    const cfg = reportConfig ? { ...reportConfig } : { ...config };
    const recent = listRecentFinishedJobs(cfg.governanceWindow);
    const sample = recent.length;
    let ok = 0;
    let error = 0;
    let canceled = 0;
    const errorClassCounts = {};
    for (const j of recent) {
      if (j.status === "ok") ok += 1;
      if (j.status === "error") {
        error += 1;
        const k = String(j.errorClass || "unknown");
        errorClassCounts[k] = (errorClassCounts[k] || 0) + 1;
      }
      if (j.status === "canceled") canceled += 1;
    }
    const failureRate = sample > 0 ? error / sample : 0;
    const topFailures = getFailureClusters({ limit: 5 });
    const report = {
      schema: 1,
      generatedAt: now(),
      config: { ...cfg },
      state: {
        lastEvaluatedAt: governance.lastEvaluatedAt,
        lastActionAt: governance.lastActionAt,
        lastAction: governance.lastAction,
        recentActions: governance.history.slice(0, 10),
        recentPolicyVersions: governance.policyVersions.slice(0, 10)
      },
      metrics: {
        sample,
        ok,
        error,
        canceled,
        failureRate,
        errorClassCounts
      },
      topFailures
    };
    report.recommendations = getGovernanceRecommendations(report, cfg);
    return report;
  }

  function getEffectiveGovernancePatch(rec, cfg = config) {
    const patch = {};
    if (cfg.governanceAutoScaleConcurrency && rec?.action?.maxConcurrent !== undefined) patch.maxConcurrent = rec.action.maxConcurrent;
    if (cfg.governanceAutoSwitchTemplate && rec?.action?.retryTemplate !== undefined) patch.retryTemplate = rec.action.retryTemplate;
    return patch;
  }

  function applyGovernanceAction(rec, { source = "manual" } = {}) {
    if (!rec || !rec.action) return { ok: false, error: "invalid_recommendation" };
    const patch = getEffectiveGovernancePatch(rec, config);
    if (!Object.keys(patch).length) return { ok: false, error: "no_effective_action" };
    const before = { maxConcurrent: config.maxConcurrent, retryTemplate: config.retryTemplate };
    const after = setConfig(patch, { source: `governance:${source}`, reason: rec.code || "governance_action" });
    const action = {
      at: now(),
      source,
      code: rec.code || "governance_action",
      reason: rec.reason || "",
      before,
      after: { maxConcurrent: after.maxConcurrent, retryTemplate: after.retryTemplate }
    };
    pushGovernanceAction(action);
    events?.emit?.({ type: "embed:jobs:governance:action", ...action });
    return { ok: true, action };
  }

  function maybeRunAutoGovernance() {
    governance.lastEvaluatedAt = now();
    if (!config.governanceEnabled) return;
    const report = getGovernanceReport({ config });
    if (report.metrics.sample < Number(config.governanceMinSample || 0)) return;
    const top = Array.isArray(report.recommendations) && report.recommendations.length ? report.recommendations[0] : null;
    if (!top) return;
    const cd = Math.max(0, Number(config.governanceCooldownMs || 0));
    if (governance.lastActionAt && cd > 0) {
      const elapsed = Date.now() - Date.parse(governance.lastActionAt);
      if (Number.isFinite(elapsed) && elapsed < cd) {
        events?.emit?.({
          type: "embed:jobs:governance:skip",
          reason: "cooldown",
          cooldownMs: cd,
          elapsedMs: elapsed
        });
        return;
      }
    }
    const r = applyGovernanceAction(top, { source: "auto" });
    if (!r.ok) {
      events?.emit?.({
        type: "embed:jobs:governance:skip",
        reason: r.error || "no_action"
      });
    }
  }

  function addHistory(j) {
    history.unshift(j);
    while (history.length > maxHistory) history.pop();
    maybeRunAutoGovernance();
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

  function setConfig(partial = {}, meta = {}) {
    const { next, changedKeys } = buildConfigFrom(config, partial);
    for (const k of Object.keys(next)) config[k] = next[k];
    const source = meta?.source || "manual";
    const reason = meta?.reason || "";
    if (changedKeys.length) maybeCreatePolicyVersion({ source, reason, changedKeys });
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

  function applyTopGovernanceRecommendation({ source = "manual" } = {}) {
    const report = getGovernanceReport({ config });
    const top = Array.isArray(report.recommendations) && report.recommendations.length ? report.recommendations[0] : null;
    if (!top) return { ok: false, error: "no_recommendation", report };
    const r = applyGovernanceAction(top, { source });
    if (!r.ok) return { ...r, report };
    return { ok: true, report, action: r.action };
  }

  function rollbackPolicyVersion(versionId, { source = "manual" } = {}) {
    const id = String(versionId || "").trim();
    if (!id) return { ok: false, error: "missing_version_id" };
    const v = governance.policyVersions.find((x) => x.id === id);
    if (!v) return { ok: false, error: "version_not_found", versionId: id };
    const cfg = setConfig({ ...(v.config || {}) }, { source: `rollback:${source}`, reason: `rollback:${id}` });
    const action = {
      at: now(),
      source: `rollback:${source}`,
      versionId: id,
      toConfig: policyConfigSnapshot()
    };
    events?.emit?.({ type: "embed:jobs:governance:rollback", ...action });
    return { ok: true, versionId: id, config: cfg, action };
  }

  function simulateGovernance({
    configPatch = {},
    mode = "recommend",
    assumeNoCooldown = true
  } = {}) {
    const { next: simulatedConfig, changedKeys } = buildConfigFrom(config, configPatch || {});
    const report = getGovernanceReport({ config: simulatedConfig });
    const top = Array.isArray(report.recommendations) && report.recommendations.length ? report.recommendations[0] : null;
    const prediction = {
      mode: String(mode || "recommend"),
      wouldApply: false,
      reason: "recommendation_only",
      topRecommendation: top || null
    };

    if (prediction.mode === "apply_top") {
      if (!top) {
        prediction.reason = "no_recommendation";
      } else {
        const cd = Math.max(0, Number(simulatedConfig.governanceCooldownMs || 0));
        let cooldownBlocked = false;
        if (!assumeNoCooldown && governance.lastActionAt && cd > 0) {
          const elapsed = Date.now() - Date.parse(governance.lastActionAt);
          cooldownBlocked = Number.isFinite(elapsed) && elapsed < cd;
          prediction.cooldown = { cooldownMs: cd, elapsedMs: elapsed, blocked: cooldownBlocked };
        }
        if (cooldownBlocked) {
          prediction.reason = "cooldown";
        } else {
          const patch = getEffectiveGovernancePatch(top, simulatedConfig);
          if (!Object.keys(patch).length) {
            prediction.reason = "no_effective_action";
          } else {
            const { next: afterConfig } = buildConfigFrom(simulatedConfig, patch);
            prediction.wouldApply = true;
            prediction.reason = "would_apply";
            prediction.patch = patch;
            prediction.afterConfig = afterConfig;
          }
        }
      }
    }

    return {
      ok: true,
      schema: 1,
      generatedAt: now(),
      baselineConfig: policyConfigSnapshot(config),
      simulatedConfig: policyConfigSnapshot(simulatedConfig),
      changedKeys,
      report,
      prediction
    };
  }

  // Seed first version snapshot after controller bootstrap.
  maybeCreatePolicyVersion({ source: "init", reason: "initial_policy", changedKeys: Object.keys(policyConfigSnapshot()) });

  return {
    enqueue,
    status: snapshot,
    getJob,
    cancel,
    setConfig,
    getConfig,
    getFailureClusters,
    getGovernanceReport,
    simulateGovernance,
    listPolicyVersions,
    retryJob,
    retryFailed,
    applyTopGovernanceRecommendation,
    rollbackPolicyVersion,
    retryTemplates: () => ({ ...RETRY_TEMPLATES })
  };
}
