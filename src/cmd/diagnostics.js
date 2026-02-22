import path from "node:path";
import { formatDiagnosticEvent, exportWorkspaceDiagnostics } from "../core/diagnostics.js";

function printHelp() {
    console.log(`
Usage:
  rmemo diagnostics <command> [options]

Commands:
  export     Export comprehensive workspace configuration and health state

Options:
  --root <dir>   Target repository root (default: current directory)
  --format       Output format (md|json), default: md
`);
}

export async function cmdDiagnostics({ rest, flags }) {
    if (rest.length === 0) {
        printHelp();
        return;
    }

    const sub = rest[0];
    const root = flags.root ? path.resolve(flags.root) : process.cwd();

    switch (sub) {
        case "export": {
            const format = flags.format || "md";
            const diag = await exportWorkspaceDiagnostics(root);
            const output = formatDiagnosticEvent({
                traceId: `cli-diag-${Date.now()}`,
                source: "cli",
                category: "diagnostics",
                payload: diag
            });

            if (format === "json") {
                console.log(JSON.stringify(output, null, 2));
            } else {
                console.log("## Workspace Diagnostics Export");
                console.log(`- **Trace ID**: ${output.traceId}`);
                console.log(`- **Timestamp**: ${output.timestamp}`);
                console.log(`- **Node**: ${diag.environment.nodeVersion}`);
                console.log(`- **Platform**: ${diag.environment.platform} ${diag.environment.arch}`);
                console.log();
                console.log("### Configurations");
                console.log(`- **rules.md exists**: ${diag.files.rulesExists}`);
                console.log(`- **manifest.json exists**: ${diag.files.manifestExists}`);
                console.log(`- **config.json exists**: ${diag.files.configExists}`);
                if (diag.config) {
                    console.log("#### config.json");
                    console.log("```json");
                    console.log(JSON.stringify(diag.config, null, 2));
                    console.log("```");
                }
                console.log();
                console.log("### Contracts");
                console.log(`- **enabled**: ${diag.contracts?.enabled ? "yes" : "no"}`);
                console.log(`- **ok**: ${diag.contracts?.ok === null ? "unknown" : diag.contracts.ok ? "yes" : "no"}`);
                if (diag.contracts?.hasDrift !== null) console.log(`- **hasDrift**: ${diag.contracts.hasDrift ? "yes" : "no"}`);
                if (diag.contracts?.hasBreaking !== null) console.log(`- **hasBreaking**: ${diag.contracts.hasBreaking ? "yes" : "no"}`);
                if (diag.contracts?.error) console.log(`- **error**: ${diag.contracts.error}`);
                console.log();
                console.log("### Release Health");
                console.log(`- **scriptExists**: ${diag.releaseHealth?.scriptExists ? "yes" : "no"}`);
                console.log(`- **workflowReleasePleaseExists**: ${diag.releaseHealth?.workflowReleasePleaseExists ? "yes" : "no"}`);
            }
            break;
        }
        default:
            console.error(`Unknown diagnostics subcommand: ${sub}`);
            printHelp();
            process.exit(1);
    }
}
