import path from "node:path";
import fs from "node:fs/promises";
import { resolveRoot } from "../lib/paths.js";
import {
  ensureTodosFile,
  parseTodos,
  addTodoNext,
  addTodoBlocker,
  removeTodoNextByIndex,
  removeTodoBlockerByIndex
} from "../core/todos.js";
import { todosPath } from "../lib/paths.js";

export async function cmdTodo({ rest, flags }) {
  const root = resolveRoot(flags);
  const sub = rest[0];

  if (!sub || sub === "help") {
    process.stdout.write(
      [
        "Usage:",
        "  rmemo todo add <text>",
        "  rmemo todo block <text>",
        "  rmemo todo done <n>",
        "  rmemo todo unblock <n>",
        "  rmemo todo ls",
        ""
      ].join("\n") + "\n"
    );
    return;
  }

  if (sub === "add") {
    const text = rest.slice(1).join(" ").trim();
    if (!text) throw new Error("Missing text. Usage: rmemo todo add <text>");
    const p = await addTodoNext(root, text);
    process.stdout.write(`Updated todos: ${path.relative(process.cwd(), p)}\n`);
    return;
  }

  if (sub === "block") {
    const text = rest.slice(1).join(" ").trim();
    if (!text) throw new Error("Missing text. Usage: rmemo todo block <text>");
    const p = await addTodoBlocker(root, text);
    process.stdout.write(`Updated todos: ${path.relative(process.cwd(), p)}\n`);
    return;
  }

  if (sub === "ls") {
    await ensureTodosFile(root);
    const md = await fs.readFile(todosPath(root), "utf8");
    const t = parseTodos(md);
    const numbered = (arr) => arr.map((x, i) => `${i + 1}. ${x}`);
    const out = [
      "# Todos",
      "",
      "## Next",
      ...(t.next.length ? numbered(t.next) : ["- (empty)"]),
      "",
      "## Blockers",
      ...(t.blockers.length ? numbered(t.blockers) : ["- (none)"]),
      ""
    ].join("\n");
    process.stdout.write(out);
    return;
  }

  if (sub === "done") {
    const n = rest[1];
    if (!n) throw new Error("Missing index. Usage: rmemo todo done <n>");
    const p = await removeTodoNextByIndex(root, n);
    process.stdout.write(`Updated todos: ${path.relative(process.cwd(), p)}\n`);
    return;
  }

  if (sub === "unblock") {
    const n = rest[1];
    if (!n) throw new Error("Missing index. Usage: rmemo todo unblock <n>");
    const p = await removeTodoBlockerByIndex(root, n);
    process.stdout.write(`Updated todos: ${path.relative(process.cwd(), p)}\n`);
    return;
  }

  throw new Error(`Unknown subcommand: todo ${sub}`);
}
