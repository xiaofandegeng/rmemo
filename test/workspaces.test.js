import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
    applyWorkspaceFocusAlertsBoardsPulsePlan,
    evaluateWorkspaceFocusAlertsBoardsPulse,
    createWorkspaceFocusAlertsBoard,
    getWorkspaceFocusAlertsBoardPolicy,
    setWorkspaceFocusAlertsBoardPolicy,
    enqueueWorkspaceFocusAlertsActionJob,
    getWorkspaceFocusAlertsActionJob,
    pauseWorkspaceFocusAlertsActionJob,
    resumeWorkspaceFocusAlertsActionJob,
    processWorkspaceFocusAlertsActionJob
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

describe("Policy Templates", () => {
    it("should return balanced defaults when no config exists", async () => {
        const root = await makeTempRepo("rmemo-test-policy-");
        try {
            const policy = await getWorkspaceFocusAlertsBoardPolicy(root);
            assert.strictEqual(policy.boardPulsePolicy, "balanced");
            assert.strictEqual(policy.boardPulseDedupePolicy, "balanced");
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });

    it("should correctly override default hours when policy='strict' is used", async () => {
        const root = await makeTempRepo("rmemo-test-policy-2-");
        try {
            const boardId = "test-board-strict";
            const boardsDir = path.join(root, ".repo-memory", "ws-focus", "action-boards");
            await fs.mkdir(boardsDir, { recursive: true });

            // Generate a task 13 hours old (todo).
            // Under "balanced", todo=24 so this is NOT an item.
            // Under "strict", todo=12 so this IS an item.
            const thirteenHoursAgo = new Date(Date.now() - 13 * 3600 * 1000).toISOString();

            const board = {
                schema: 1, id: boardId, createdAt: thirteenHoursAgo, updatedAt: thirteenHoursAgo, title: "Test Board", actionId: "mock",
                items: [
                    { id: "item1", kind: "next", status: "todo", text: "Task Overdue in Strict", createdAt: thirteenHoursAgo, updatedAt: thirteenHoursAgo }
                ]
            };
            await writeJson(path.join(boardsDir, `${boardId}.json`), board);
            await writeJson(path.join(boardsDir, "index.json"), { schema: 1, boards: [board] });

            // Test 1: balanced default => zero overdue items
            const pulseBalanced = await evaluateWorkspaceFocusAlertsBoardsPulse(root, { save: false });
            assert.strictEqual(pulseBalanced.overdueItems.length, 0, "No items overdue under balanced policy (24h)");

            // Test 2: strict policy => one overdue item (12h)
            const pulseStrict = await evaluateWorkspaceFocusAlertsBoardsPulse(root, { policy: "strict", save: false });
            assert.strictEqual(pulseStrict.overdueItems.length, 1, "Item overdue under strict policy (12h)");
            assert.strictEqual(pulseStrict.overdueItems[0].itemId, "item1");

            // Test 3: configure strict globally => one overdue item
            await setWorkspaceFocusAlertsBoardPolicy(root, { boardPulsePolicy: "strict" });
            const pulseGlobalStrict = await evaluateWorkspaceFocusAlertsBoardsPulse(root, { save: false });
            assert.strictEqual(pulseGlobalStrict.overdueItems.length, 1, "Item overdue under saved global strict policy");
        } finally {
            try { await fs.rm(root, { recursive: true, force: true }); } catch (e) { }
        }
    });
});


describe("Action Jobs Lifecycle", () => {
    it("should enqueue, pause, resume, and complete a multi-batch action job", async () => {
        const root = await makeTempRepo("rmemo-test-action-jobs-");
        try {
            const actionId = "act-mock-123";
            const actionsDir = path.join(root, ".repo-memory", "ws-focus", "actions");
            await fs.mkdir(actionsDir, { recursive: true });

            // Create a mock action with 5 tasks
            const fakeAction = {
                schema: 1,
                actionId,
                plan: {
                    title: "Mock Plan",
                    tasks: Array.from({ length: 5 }, (_, i) => ({ id: `t${i + 1}`, kind: "todo", text: `Mock Task ${i + 1}` }))
                }
            };
            await writeJson(path.join(actionsDir, `${actionId}.json`), fakeAction);

            // 1. Enqueue job (batch size = 2)
            const enqueueResult = await enqueueWorkspaceFocusAlertsActionJob(root, {
                actionId,
                batchSize: 2
            });

            assert.ok(enqueueResult.id, "Job ID should be generated");
            assert.strictEqual(enqueueResult.status, "queued", "Job should start queued");
            assert.strictEqual(enqueueResult.tasks.length, 5, "Job should contain all tasks from action");

            const jobId = enqueueResult.id;

            // Wait a moment for background processing to start and do *something*,
            // but we want to intercept it or observe its states
            // We will pause it immediately to test interruption
            await new Promise(r => setTimeout(r, 50));
            await pauseWorkspaceFocusAlertsActionJob(root, jobId);

            // Fetch current state
            let job = await getWorkspaceFocusAlertsActionJob(root, jobId);
            assert.strictEqual(job.status, "paused", "Job should successfully toggle to paused");

            // Resume the job and WAIT for processing to finish
            await resumeWorkspaceFocusAlertsActionJob(root, jobId);

            // Poll for completion (up to 5s)
            let retries = 50;
            while (retries-- > 0) {
                job = await getWorkspaceFocusAlertsActionJob(root, jobId);
                if (job.status === "succeeded" || job.status === "failed") break;
                await new Promise(r => setTimeout(r, 100));
            }

            assert.strictEqual(job.status, "succeeded", "Job should eventually succeed");
            assert.strictEqual(job.state.processedCount, 5, "Should process all 5 items");
            assert.strictEqual(job.state.successCount, 5, "Should succeed all 5 items");
            assert.strictEqual(job.state.resumeToken, 5, "Resume token should advance to end of tasks array");

        } finally {
            try { await fs.rm(root, { recursive: true, force: true }); } catch (e) { }
        }
    });

    it('should process a large batch job (>200 items) and persist correctly', async () => {
        const root = await makeTempRepo("rmemo-test-action-jobs-large-");
        try {
            const actionsDir = path.join(root, ".repo-memory", "ws-focus", "actions");
            await fs.mkdir(actionsDir, { recursive: true });

            const actionId = "act-large-test";
            const fakeAction = {
                schema: 1,
                actionId,
                plan: {
                    title: "Large Plan",
                    tasks: Array.from({ length: 250 }, (_, i) => ({ id: `t${i}`, kind: "todo", text: `Stress Task ${i}` }))
                }
            };
            await writeJson(path.join(actionsDir, `${actionId}.json`), fakeAction);

            // Enqueue job with batch size 50
            const enqueueResult = await enqueueWorkspaceFocusAlertsActionJob(root, {
                actionId,
                batchSize: 50
            });

            const jobId = enqueueResult.id;

            // Wait until done
            let job = enqueueResult;
            let retries = 100; // max 10s wait
            while (retries-- > 0) {
                job = await getWorkspaceFocusAlertsActionJob(root, jobId);
                if (job.status === "succeeded" || job.status === "failed") break;
                await new Promise(r => setTimeout(r, 100));
            }

            assert.strictEqual(job.status, "succeeded", "Large job should succeed");
            assert.strictEqual(job.state.processedCount, 250, "Should process all 250 items");
            assert.strictEqual(job.state.successCount, 250, "Should succeed all 250 items");
            assert.strictEqual(job.state.resumeToken, 250, "Resume token should be 250");
        } finally {
            try { await fs.rm(root, { recursive: true, force: true }); } catch (e) { }
        }
    });
});
