import { Router } from "express";
import { spawn } from "node:child_process";

const router = Router();

/**
 * Health check endpoint that verifies:
 * 1. The service is running
 * 2. Claude CLI is installed and accessible
 */
router.get("/health", async (_req, res) => {
  const claudeAvailable = await checkClaudeCliAvailable();

  if (claudeAvailable) {
    res.json({
      status: "healthy",
      claudeCli: "available",
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: "unhealthy",
      claudeCli: "unavailable",
      timestamp: new Date().toISOString(),
      error: "Claude CLI not found or not accessible",
    });
  }
});

/**
 * Checks if Claude CLI is installed and accessible.
 */
async function checkClaudeCliAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;

    const safeResolve = (value: boolean) => {
      if (!resolved) {
        resolved = true;
        resolve(value);
      }
    };

    const proc = spawn("claude", ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.on("close", (code) => {
      safeResolve(code === 0);
    });

    proc.on("error", () => {
      safeResolve(false);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      if (!resolved) {
        proc.kill();
        safeResolve(false);
      }
    }, 5000);
  });
}

export default router;
