import { startAgent } from "./agent.js";
import { registerCommand } from "./commands/register.js";

async function main() {
  // Check if this is a register command
  const args = process.argv.slice(2);
  if (args[0] === "register") {
    await registerCommand();
    return;
  }

  console.log("Starting CashClaw...");

  const server = await startAgent();

  // Open browser
  const url = "http://localhost:3777";
  const { execFile: execFileCb } = await import("node:child_process");
  const opener = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "start"
      : "xdg-open";
  execFileCb(opener, [url], () => {});

  // Graceful shutdown
  const shutdown = () => {
    console.log("\nShutting down...");
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
