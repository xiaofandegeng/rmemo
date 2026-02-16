import { buildEmbeddingsIndex } from "./embeddings.js";

function now() {
  return new Date().toISOString();
}

export function createEmbedJobsController(root, { events, maxHistory = 50 } = {}) {
  const queue = [];
  const history = [];
  let active = null;
  let seq = 0;

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
      params: j.params || {},
      progress: j.progress || null,
      resultMeta: j.resultMeta || null,
      error: j.error || null
    };
  }

  function snapshot() {
    return {
      schema: 1,
      generatedAt: now(),
      active: snapshotJob(active),
      queued: queue.map(snapshotJob),
      history: history.map(snapshotJob)
    };
  }

  function addHistory(j) {
    history.unshift(j);
    while (history.length > maxHistory) history.pop();
  }

  async function runNext() {
    if (active || !queue.length) return;
    active = queue.shift();
    active.status = "running";
    active.startedAt = now();
    active.abort = new AbortController();
    events?.emit?.({ type: "embed:job:start", jobId: active.id, trigger: active.trigger || "api" });

    try {
      const built = await buildEmbeddingsIndex(root, {
        ...(active.params || {}),
        signal: active.abort.signal,
        onProgress: (p) => {
          active.progress = p;
          events?.emit?.({ type: "embed:job:progress", jobId: active.id, ...p });
        }
      });
      active.status = "ok";
      active.finishedAt = now();
      active.resultMeta = built.meta;
      events?.emit?.({
        type: "embed:job:ok",
        jobId: active.id,
        provider: built?.meta?.provider,
        embeddedItems: built?.meta?.embeddedItems,
        reusedItems: built?.meta?.reusedItems,
        elapsedMs: built?.meta?.elapsedMs
      });
    } catch (e) {
      const msg = e?.message || String(e);
      if (active.abort?.signal?.aborted) {
        active.status = "canceled";
        active.error = msg;
        events?.emit?.({ type: "embed:job:canceled", jobId: active.id, error: msg });
      } else {
        active.status = "error";
        active.error = msg;
        events?.emit?.({ type: "embed:job:err", jobId: active.id, error: msg });
      }
      active.finishedAt = now();
    } finally {
      const done = active;
      delete done.abort;
      addHistory(done);
      active = null;
      void runNext();
    }
  }

  function enqueue(params = {}, { trigger = "api", reason = "" } = {}) {
    const job = {
      id: `ej_${Date.now()}_${++seq}`,
      status: "queued",
      createdAt: now(),
      trigger,
      reason,
      params,
      progress: null
    };
    queue.push(job);
    events?.emit?.({ type: "embed:job:queued", jobId: job.id, trigger, queueSize: queue.length });
    void runNext();
    return snapshotJob(job);
  }

  function getJob(jobId) {
    if (active && active.id === jobId) return snapshotJob(active);
    const q = queue.find((j) => j.id === jobId);
    if (q) return snapshotJob(q);
    const h = history.find((j) => j.id === jobId);
    if (h) return snapshotJob(h);
    return null;
  }

  function cancel(jobId) {
    if (active && active.id === jobId) {
      try {
        active.abort?.abort();
      } catch {
        // ignore
      }
      active.status = "canceling";
      return { ok: true, id: jobId, state: "canceling" };
    }
    const i = queue.findIndex((j) => j.id === jobId);
    if (i !== -1) {
      const [j] = queue.splice(i, 1);
      j.status = "canceled";
      j.finishedAt = now();
      j.error = "canceled before start";
      addHistory(j);
      events?.emit?.({ type: "embed:job:canceled", jobId: j.id, error: j.error });
      return { ok: true, id: jobId, state: "canceled" };
    }
    return { ok: false, id: jobId, error: "job_not_found" };
  }

  return {
    enqueue,
    status: snapshot,
    getJob,
    cancel
  };
}

