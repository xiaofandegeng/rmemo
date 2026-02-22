import os from "os";
import path from "path";
import { readJsonSafe } from "../lib/io.js";
import { fileExists, readText } from "../lib/io.js";
import { memDir, manifestPath, configPath, rulesPath } from "../lib/paths.js";
import { runContractCheck } from "./contract.js";

// Standardized Error Codes
export const ERROR_CODES = {
    CONFIG: "RMEMO_CONFIG_ERROR",
    RUNTIME: "RMEMO_RUNTIME_ERROR",
    PERMISSION: "RMEMO_PERMISSION_ERROR",
    UNKNOWN: "RMEMO_UNKNOWN_ERROR"
};

/**
 * Creates a standard diagnostic event envelope.
 * @param {Object} params
 * @param {string} params.traceId - Request/session identifier
 * @param {string} params.source - Current origin (e.g. 'cli', 'http', 'mcp')
 * @param {string} params.category - Domain grouping (e.g. 'workspace', 'embed', 'diagnostics')
 * @param {number} params.costMs - Execution time in milliseconds
 * @param {string} [params.errorClass] - One of ERROR_CODES (optional if success)
 * @param {string} [params.errorMessage] - Underlying error message (optional if success)
 * @param {Object} [params.payload] - Additional info (optional)
 * @returns {Object} Envelope
 */
export function formatDiagnosticEvent({
    traceId = `tr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    source = "unknown",
    category = "general",
    costMs = 0,
    errorClass,
    errorMessage,
    payload = {}
}) {
    return {
        traceId,
        timestamp: new Date().toISOString(),
        source,
        category,
        costMs,
        errorClass: errorClass || null,
        errorMessage: errorMessage || null,
        payload
    };
}

/**
 * Aggregates workspace health and configuration info.
 * @param {string} root - the repo root
 */
export async function exportWorkspaceDiagnostics(root) {
    const memoryDir = memDir(root);
    const result = {
        // Environment Info
        environment: {
            platform: os.platform(),
            release: os.release(),
            arch: os.arch(),
            nodeVersion: process.version,
            timestamp: new Date().toISOString()
        },
        // Core file statuses
        files: {
            manifestExists: await fileExists(manifestPath(root)),
            configExists: await fileExists(configPath(root)),
            rulesExists: await fileExists(rulesPath(root))
        },
        // Extracted configurations
        config: null,
        manifestMeta: null,
        contracts: {
            enabled: false,
            ok: null,
            hasDrift: null,
            hasBreaking: null,
            additiveCount: 0,
            breakingCount: 0,
            error: null
        },
        releaseHealth: {
            scriptExists: false,
            workflowReleasePleaseExists: false
        }
    };

    if (result.files.configExists) {
        try {
            result.config = await readJsonSafe(configPath(root));
        } catch (e) {
            result.config = { error: "Unparseable JSON", raw: e.message };
        }
    }

    if (result.files.manifestExists) {
        try {
            const manifest = await readJsonSafe(manifestPath(root));
            result.manifestMeta = {
                subprojects: manifest.subprojects?.length || 0,
                techStack: manifest.techStack?.slice(0, 10) || []
            };
        } catch (e) {
            result.manifestMeta = { error: "Unparseable JSON", raw: e.message };
        }
    }

    try {
        const c = await runContractCheck({ root, failOn: "breaking", update: false });
        result.contracts = {
            enabled: true,
            ok: !!c.ok,
            hasDrift: !!c.hasDrift,
            hasBreaking: !!c.hasBreaking,
            additiveCount: Number(c.additiveCount || 0),
            breakingCount: Number(c.breakingCount || 0),
            error: null
        };
    } catch (e) {
        result.contracts = {
            enabled: false,
            ok: null,
            hasDrift: null,
            hasBreaking: null,
            additiveCount: 0,
            breakingCount: 0,
            error: String(e?.message || e)
        };
    }

    result.releaseHealth = {
        scriptExists: await fileExists(path.join(root, "scripts", "release-health.js")),
        workflowReleasePleaseExists: await fileExists(path.join(root, ".github", "workflows", "release-please.yml"))
    };

    return result;
}
