#!/usr/bin/env node
import { cmdInit } from "../src/cmd/init.js";
import { cmdScan } from "../src/cmd/scan.js";
import { cmdLog } from "../src/cmd/log.js";
import { cmdContext } from "../src/cmd/context.js";
import { cmdPrint } from "../src/cmd/print.js";
import { cmdStatus } from "../src/cmd/status.js";
import { cmdCheck } from "../src/cmd/check.js";
import { cmdHook } from "../src/cmd/hook.js";
import { cmdStart } from "../src/cmd/start.js";
import { cmdDone } from "../src/cmd/done.js";
import { cmdTodo } from "../src/cmd/todo.js";
import { cmdTemplate } from "../src/cmd/template.js";
import { cmdSync } from "../src/cmd/sync.js";
import { cmdSetup } from "../src/cmd/setup.js";
import { cmdHandoff } from "../src/cmd/handoff.js";
import { cmdPr } from "../src/cmd/pr.js";
import { cmdWatch } from "../src/cmd/watch.js";
import { cmdWs } from "../src/cmd/ws.js";
import { cmdProfile } from "../src/cmd/profile.js";
import { parseArgs, printHelp } from "../src/lib/args.js";
import { exitWithError } from "../src/lib/io.js";

const argv = process.argv.slice(2);
const { cmd, rest, flags } = parseArgs(argv);

try {
  switch (cmd) {
    case "init":
      await cmdInit({ flags });
      break;
    case "scan":
      await cmdScan({ flags });
      break;
    case "log":
      await cmdLog({ rest, flags });
      break;
    case "context":
      await cmdContext({ flags });
      break;
    case "print":
      await cmdPrint({ flags });
      break;
    case "status":
      await cmdStatus({ flags });
      break;
    case "check":
      await cmdCheck({ flags });
      break;
    case "hook":
      await cmdHook({ rest, flags });
      break;
    case "start":
      await cmdStart({ flags });
      break;
    case "done":
      await cmdDone({ rest, flags });
      break;
    case "todo":
      await cmdTodo({ rest, flags });
      break;
    case "template":
      await cmdTemplate({ rest, flags });
      break;
    case "sync":
      await cmdSync({ flags });
      break;
    case "setup":
      await cmdSetup({ flags });
      break;
    case "handoff":
      await cmdHandoff({ flags });
      break;
    case "pr":
      await cmdPr({ flags });
      break;
    case "watch":
      await cmdWatch({ flags });
      break;
    case "ws":
      await cmdWs({ rest, flags });
      break;
    case "profile":
      await cmdProfile({ rest, flags });
      break;
    case "help":
    case undefined:
      printHelp();
      break;
    default:
      exitWithError(`Unknown command: ${cmd}\n\nRun: rmemo help`);
  }
} catch (err) {
  exitWithError(err?.stack || err?.message || String(err));
}
