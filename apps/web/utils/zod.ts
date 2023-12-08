import { z } from "zod";

// to avoid "false" being parsed as `true`
// https://github.com/colinhacks/zod/issues/1630
export const zodTrueFalse = z
  .enum(["true", "false"])
  .nullish()
  .transform((v) => v === "true");
