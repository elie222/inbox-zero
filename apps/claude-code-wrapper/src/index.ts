import express from "express";
import healthRouter from "./routes/health.js";
import generateRouter from "./routes/generate.js";
import streamRouter from "./routes/stream.js";
import { logger } from "./logger.js";

const app = express();
const PORT = process.env.PORT || 3100;
const API_KEY = process.env.API_KEY;

// Middleware
app.use(express.json({ limit: "10mb" }));

// Optional API key authentication
if (API_KEY) {
  app.use((req, res, next) => {
    // Skip auth for health check
    if (req.path === "/health") {
      next();
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing authorization header" });
      return;
    }

    const token = authHeader.slice(7);
    if (token !== API_KEY) {
      res.status(403).json({ error: "Invalid API key" });
      return;
    }

    next();
  });
}

// Request logging
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use(healthRouter);
app.use(generateRouter);
app.use(streamRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    logger.error("Unhandled error:", err);
    res.status(500).json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  },
);

// Start server
app.listen(PORT, () => {
  logger.info(`Claude Code Wrapper listening on port ${PORT}`);
  logger.info(`API Key authentication: ${API_KEY ? "enabled" : "disabled"}`);
});

export default app;
