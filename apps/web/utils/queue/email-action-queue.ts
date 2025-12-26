"use client";

import PQueue from "p-queue";

// Gmail API can handle moderate parallelism - 1 was too conservative
// 5 concurrent gives good throughput without hitting rate limits
export const emailActionQueue = new PQueue({ concurrency: 5 });
