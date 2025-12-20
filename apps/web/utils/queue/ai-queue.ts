"use client";

import PQueue from "p-queue";

// Process multiple AI requests in parallel for faster bulk operations
export const aiQueue = new PQueue({ concurrency: 3 });

export const pauseAiQueue = () => aiQueue.pause();
export const resumeAiQueue = () => aiQueue.start();
export const clearAiQueue = () => aiQueue.clear();
export const isAiQueuePaused = () => aiQueue.isPaused;
