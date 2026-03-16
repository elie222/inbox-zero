// Bump this when draft output behavior changes in a way that would affect
// quality comparisons, including prompt, retrieval, routing, or
// post-processing changes.
export const DRAFT_PIPELINE_VERSION = 1;

export type DraftAttribution = {
  provider: string;
  modelName: string;
  pipelineVersion: number;
};
