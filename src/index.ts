import { startAgent } from "./agent.js";
import { validateConfig } from "./config.js";
import { checkSystemRequirements, recoverFromErrors } from "./startup/validation.js";

async function validateStartup() {
  console.log("Validating system requirements...");

  try {
    // Check system requirements
    await checkSystemRequirements();

    // Validate configuration
    const config = await validateConfig();
    console.log("Configuration validated successfully");

    return config;
  } catch (error) {
    console.error("Startup validation failed:", error instanceof Error ? error.message : error);

    // Attempt recovery
    console.log("Attempting automatic recovery...");
    try {
      await recoverFromErrors(error);
      console.log("Recovery successful, retrying validation...");

      // Retry validation after recovery
      await checkSystemRequirements();
      const config = await validateConfig();
      console.log("Configuration validated after recovery");

      return config;
    } catch (recoveryError) {
      console.error("Recovery failed:", recoveryError instanceof Error ? recoveryError.message : recoveryError);
      throw new Error(`Startup failed and recovery unsuccessful: ${error instanceof Error ? error.message : error}`);
    }
  }
}

async function main() {
  console.log("Starting CashClaw...");

  try {
    // Validate startup requirements before initializing
    await validateStartup();

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

    console.log("CashClaw started successfully");

    // Graceful shutdown
    const shutdown = () => {
      console.log("\nShutting down...");
      server.close();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("Failed to start CashClaw:", error instanceof Error ? error.message : error);

    // Log additional debug information
    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }

    console.error("Please check your configuration and try again.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error("Stack trace:", err.stack);
  }
  process.exit(1);
});
