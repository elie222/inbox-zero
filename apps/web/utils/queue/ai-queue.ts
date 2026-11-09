"use client";

import PQueue from "p-queue";

const DEFAULT_CONCURRENCY = 3;

// Process multiple AI requests in parallel for faster bulk operations
export const aiQueue = new PQueue({ concurrency: DEFAULT_CONCURRENCY });

export const pauseAiQueue = () => aiQueue.pause();
export const resumeAiQueue = () => aiQueue.start();
export const clearAiQueue = () => aiQueue.clear();
export const isAiQueuePaused = () => aiQueue.isPaused;
export const slowDownAiQueue = () => {
  aiQueue.concurrency = 1;
};
export const resetAiQueueConcurrency = () => {
  aiQueue.concurrency = DEFAULT_CONCURRENCY;
};
