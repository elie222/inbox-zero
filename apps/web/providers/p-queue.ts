"use client";

import PQueue from "p-queue";

export const queue = new PQueue({ concurrency: 3 });
