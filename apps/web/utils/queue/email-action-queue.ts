"use client";

import PQueue from "p-queue";

// Avoid overwhelming Gmail API
export const emailActionQueue = new PQueue({ concurrency: 1 });
