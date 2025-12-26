"use client";

import PQueue from "p-queue";

// Process multiple AI requests in parallel for faster bulk operations
// Azure AI Foundry can handle higher concurrency than typical LLM endpoints
// With Sonnet (3-5x faster than Opus), we can increase concurrency
export const aiQueue = new PQueue({ concurrency: 30 });

export const pauseAiQueue = () => aiQueue.pause();
export const resumeAiQueue = () => aiQueue.start();
export const clearAiQueue = () => aiQueue.clear();
export const isAiQueuePaused = () => aiQueue.isPaused;
