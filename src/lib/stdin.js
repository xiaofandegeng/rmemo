export async function readStdinText() {
  // If nothing is piped, stdin is usually a TTY. Do not block waiting for EOF.
  if (process.stdin.isTTY) return "";
  return await new Promise((resolve, reject) => {
    let s = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (s += chunk));
    process.stdin.on("end", () => resolve(s));
    process.stdin.on("error", reject);
    process.stdin.resume();
  });
}
