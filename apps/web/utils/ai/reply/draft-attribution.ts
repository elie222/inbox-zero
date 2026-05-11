// Bump this when draft output behavior changes in a way that would affect
// quality comparisons, including prompt, retrieval, routing, or
// post-processing changes.
export const DRAFT_PIPELINE_VERSION = 12;

export type DraftAttribution = {
  provider: string;
  modelName: string;
  pipelineVersion: number;
};

export function createDraftAttributionTracker(
  pipelineVersion = DRAFT_PIPELINE_VERSION,
) {
  let attribution: DraftAttribution | null = null;

  return {
    get attribution() {
      return attribution;
    },
    onModelUsed({
      provider,
      modelName,
    }: {
      provider: string;
      modelName: string;
    }) {
      attribution = {
        provider,
        modelName,
        pipelineVersion,
      };
    },
  };
}
