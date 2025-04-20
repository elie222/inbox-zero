import { createHash } from "node:crypto";

export const hash = (str: string) =>
  createHash("sha256").update(str).digest("hex").slice(0, 16);
