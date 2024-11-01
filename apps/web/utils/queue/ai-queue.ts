"use client";

import PQueue from "p-queue";

// Avoid overwhelming AI API
export const aiQueue = new PQueue({ concurrency: 1 });
