import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  extractKnowledgeMemories,
  formatKnowledgeSearchMarkdown,
  linkKnowledgeMemories,
  searchKnowledgeMemories,
  writeKnowledgeMemory
} from "../src/core/knowledge_memory.js";
import { knowledgeStorePath } from "../src/lib/paths.js";
import { fileExists, readJson } from "../src/lib/io.js";

test("knowledge memory: extract/search/write/link lifecycle", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-knowledge-"));
  await fs.mkdir(path.join(root, ".repo-memory", "journal"), { recursive: true });
  await fs.writeFile(
    path.join(root, ".repo-memory", "todos.md"),
    "# Todos\n\n## Next\n- Implement auth refresh flow in src/auth/service.ts\n\n## Blockers\n- Await API schema review\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(root, ".repo-memory", "journal", "2026-02-20.md"),
    "# Journal 2026-02-20\n\n## 10:00 Done\nDecided to split auth service into smaller modules.\n\n## 11:30 Log\nRisk: token refresh regression if retry logic changes.\n",
    "utf8"
  );

  const extracted = await extractKnowledgeMemories(root, { recentDays: 30, source: "test:auto" });
  assert.equal(extracted.schema, 1);
  assert.ok(extracted.created >= 2);
  assert.equal(await fileExists(knowledgeStorePath(root)), true);

  const store = await readJson(knowledgeStorePath(root));
  assert.equal(store.schema, 1);
  assert.ok(Array.isArray(store.entries));
  assert.ok(store.entries.length >= extracted.created);

  const search1 = await searchKnowledgeMemories(root, { q: "auth", limit: 20 });
  assert.equal(search1.schema, 1);
  assert.ok(search1.total >= 1);
  assert.ok(search1.entries.some((x) => (x.tags || []).includes("auth") || String(x.summary || "").toLowerCase().includes("auth")));

  const manual = await writeKnowledgeMemory(root, {
    title: "Set token cache TTL to 10m",
    summary: "Avoid stale token in gateway cache when auth provider rotates credentials.",
    type: "decision",
    status: "done",
    tags: ["auth", "cache"],
    modules: ["src/auth"],
    source: "test:manual"
  });
  assert.equal(manual.schema, 1);
  assert.equal(manual.created, true);
  assert.ok(manual.entry.id);

  const updated = await writeKnowledgeMemory(root, {
    id: manual.entry.id,
    status: "wip",
    summary: "Decision drafted; final rollout pending canary verification."
  });
  assert.equal(updated.created, false);
  assert.equal(updated.entry.id, manual.entry.id);
  assert.equal(updated.entry.status, "wip");

  const target = search1.entries[0];
  const linked = await linkKnowledgeMemories(root, {
    from: manual.entry.id,
    to: target.id,
    kind: "depends_on",
    note: "Decision depends on current auth implementation details.",
    weight: 0.8,
    source: "test:link"
  });
  assert.equal(linked.schema, 1);
  assert.ok(linked.relation.id);

  const search2 = await searchKnowledgeMemories(root, { q: "token", limit: 20 });
  assert.ok(search2.entries.some((x) => x.id === manual.entry.id));
  assert.ok(search2.relations.some((r) => r.id === linked.relation.id));

  const md = formatKnowledgeSearchMarkdown(search2);
  assert.ok(md.includes("# Knowledge Memory Search"));
  assert.ok(md.includes("## Relations"));
});
