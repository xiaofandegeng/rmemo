import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
    applyWorkspaceFocusAlertsBoardsPulsePlan,
    evaluateWorkspaceFocusAlertsBoardsPulse,
    createWorkspaceFocusAlertsBoard
} from "../src/core/workspaces.js";
import { fileExists, writeJson, readJson } from "../src/lib/io.js";
import { ensureRepoMemory } from "../src/core/memory.js";

async function makeTempRepo(prefix) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    await ensureRepoMemory(dir);
    await writeJson(path.join(dir, ".repo-memory", "manifest.json"), {
        schema: 1,
        root: dir,
        subprojects: [{ dir: ".", reasons: ["mock"] }]
    });
    return dir;
}

describe("Pulse Deduplication", () => {
    it("should deduplicate tasks correctly", async () => {
        const root = await makeTempRepo("rmemo-test-dedupe-");

        try {
            // 1. Setup a board with overdue items directly
            const boardId = "test-board-123";
            const boardsDir = path.join(root, ".repo-memory", "ws-focus", "action-boards");
            await fs.mkdir(boardsDir, { recursive: true });
            const boardPath = path.join(boardsDir, `${boardId}.json`);

            const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
            const board = {
                schema: 1,
                id: boardId,
                createdAt: twoDaysAgo,
                updatedAt: twoDaysAgo,
                actionId: "mock-action",
                title: "Test Board",
                items: [
                    { id: "item1", kind: "next", status: "todo", text: "Task A", createdAt: twoDaysAgo, updatedAt: twoDaysAgo }
                ]
            };
            await writeJson(boardPath, board);

            // Also write it to the boards index
            const indexPath = path.join(boardsDir, "index.json");
            await writeJson(indexPath, {
                schema: 1,
                updatedAt: twoDaysAgo,
                boards: [{
                    id: boardId,
                    createdAt: twoDaysAgo,
                    updatedAt: twoDaysAgo,
                    actionId: "mock-action",
                    title: "Test Board"
                }]
            });

            // 2. Generate and apply pulse
            const firstApply = await applyWorkspaceFocusAlertsBoardsPulsePlan(root, {
                limitBoards: 10,
                todoHours: 1,
                doingHours: 1,
                blockedHours: 1,
                limitItems: 10,
                noLog: true,
                dedupe: true,
                dedupeWindowHours: 72,
                dryRun: false
            });

            assert.strictEqual(firstApply.taskSummary.proposedCount, 1, "Should propose 1 task");
            assert.strictEqual(firstApply.taskSummary.appendedCount, 1, "Should append 1 task on first run");
            assert.strictEqual(firstApply.taskSummary.skippedDuplicateCount, 0, "No dupes on first run");

            // 3. Apply again with active dedupe window
            const secondApply = await applyWorkspaceFocusAlertsBoardsPulsePlan(root, {
                limitBoards: 10,
                todoHours: 1,
                doingHours: 1,
                blockedHours: 1,
                limitItems: 10,
                noLog: true,
                dedupe: true,
                dedupeWindowHours: 72,
                dryRun: false
            });

            assert.strictEqual(secondApply.taskSummary.proposedCount, 1, "Still proposed from source");
            assert.strictEqual(secondApply.taskSummary.appendedCount, 0, "Should append 0 due to dedupe");
            assert.strictEqual(secondApply.taskSummary.skippedDuplicateCount, 1, "Should skip 1 duplicate");

            // 4. Test dry_run
            const thirdApply = await applyWorkspaceFocusAlertsBoardsPulsePlan(root, {
                limitBoards: 10,
                todoHours: 1,
                doingHours: 1,
                blockedHours: 1,
                limitItems: 10,
                noLog: true,
                dedupe: true,
                dedupeWindowHours: 72,
                dryRun: true
            });

            assert.strictEqual(thirdApply.dryRun, true);
            assert.strictEqual(thirdApply.taskSummary.appendedCount, 0);
            assert.strictEqual(thirdApply.taskSummary.skippedDuplicateCount, 1);

        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });
});
