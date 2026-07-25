import { z } from "zod";

export const KEBAB_CASE_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const EVAL_SPLITS = ["dev", "test"] as const;

/**
 * The seven axes from docs/case-design.md. Every case must declare which of
 * these it exercises, because the report breaks the pass rate down by axis and
 * an axis with no cases is an unmeasured failure class.
 */
export const DIFFICULTY_AXES = [
  "verbosity-pressure",
  "retrieval-pressure",
  "absence-pressure",
  "conflict-pressure",
  "multi-ask",
  "thread-depth",
  "language",
] as const;

export const DIFFICULTY_LEVELS = ["easy", "medium", "hard"] as const;

export const evalSplitSchema = z.enum(EVAL_SPLITS);
export const difficultyAxisSchema = z.enum(DIFFICULTY_AXES);
export const difficultyLevelSchema = z.enum(DIFFICULTY_LEVELS);

export const provenanceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("handwritten"),
    reviewedBy: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("synthetic"),
    reviewedBy: z.string().nullable(),
    specId: z.string().nullable().default(null),
    generatorModel: z.string().nullable().default(null),
    verifierModel: z.string().nullable().default(null),
  }),
  z.object({
    kind: z.literal("mined-shape"),
    reviewedBy: z.string().nullable(),
    sourceMode: z.string().nullable().default(null),
    shapeAbstract: z.string().nullable().default(null),
  }),
]);

export const baseEvalCaseSchema = z.object({
  id: z.string().regex(KEBAB_CASE_REGEX, "id must be kebab-case"),
  suite: z.string().regex(KEBAB_CASE_REGEX, "suite must be kebab-case"),
  split: evalSplitSchema,
  tags: z.array(z.string()).default([]),
  difficultyAxes: z.array(difficultyAxisSchema).min(1),
  difficulty: difficultyLevelSchema,
  provenance: provenanceSchema,
  notes: z.string().default(""),
  enabled: z.boolean().default(true),
  samples: z.number().int().positive().optional(),
});

export type EvalCaseEnvelope = z.infer<typeof baseEvalCaseSchema>;
export type EvalSplit = z.infer<typeof evalSplitSchema>;
export type DifficultyAxis = z.infer<typeof difficultyAxisSchema>;
export type DifficultyLevel = z.infer<typeof difficultyLevelSchema>;

/**
 * docs/case-design.md: a thousand unreviewed synthetic cases move the measured
 * number without moving the product. Generated cases only count once a human
 * has signed off; handwritten cases count immediately.
 */
export function isCountableCase(evalCase: EvalCaseEnvelope): boolean {
  if (!evalCase.enabled) return false;
  if (evalCase.provenance.kind === "handwritten") return true;
  return evalCase.provenance.reviewedBy !== null;
}
