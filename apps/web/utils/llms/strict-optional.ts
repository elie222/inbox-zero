import { z } from "zod";

export function strictOptional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => value ?? null, schema.nullable());
}
