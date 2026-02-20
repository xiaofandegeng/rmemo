import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { exportWorkspaceDiagnostics, formatDiagnosticEvent, ERROR_CODES } from "../src/core/diagnostics.js";
import { ensureRepoMemory } from "../src/core/memory.js";

test("exportWorkspaceDiagnostics returns full environment suite", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-diag-"));
    await ensureRepoMemory(root);

    const diag = await exportWorkspaceDiagnostics(root);

    assert.ok(diag.environment);
    assert.ok(diag.environment.nodeVersion);
    assert.ok(diag.environment.platform);

    // ensureRepoMemory creates config and rules, but not manifest
    assert.equal(diag.files.manifestExists, false);
    assert.equal(diag.files.configExists, true);
    assert.equal(diag.files.rulesExists, true);

    const event = formatDiagnosticEvent({
        source: "test",
        category: "diagnostics",
        payload: diag,
        costMs: 15
    });

    assert.ok(event.traceId.startsWith("tr-"));
    assert.equal(event.source, "test");
    assert.equal(event.category, "diagnostics");
    assert.equal(event.costMs, 15);
    assert.equal(event.errorClass, null);
    assert.equal(event.payload.environment.platform, diag.environment.platform);
});
