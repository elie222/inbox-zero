import type { Prisma } from "@/generated/prisma/client";
import type { ParsedMessage } from "@/utils/types";
import { stripReferralSignature } from "@/utils/referral/signature";
import { calculateSimilarity } from "@/utils/similarity-score";

const BODY_SIMILARITY_STATUS = {
  SCORED: "scored",
  EMPTY_SENT_TEXT: "empty_sent_text",
  MISSING_DRAFT_TEXT: "missing_draft_text",
  MISSING_SENT_BODY: "missing_sent_body",
  SNIPPET_ONLY_SENT_BODY: "snippet_only_sent_body",
} as const;

type BodySimilarityStatus =
  (typeof BODY_SIMILARITY_STATUS)[keyof typeof BODY_SIMILARITY_STATUS];

export function getDraftSendLogSimilarityFields({
  draftText,
  sentMessage,
  sentText,
  accountSignature,
  draftExists,
  sentMessageRepliesToSource,
}: {
  draftText?: string | null;
  sentMessage: ParsedMessage;
  sentText: string | null;
  accountSignature?: string | null;
  draftExists: boolean;
  sentMessageRepliesToSource: boolean | null;
}) {
  const bodySimilarity = getBodySimilarityResult({
    draftText,
    sentMessage,
    sentText,
    accountSignature,
  });

  return {
    bodySimilarityScore: bodySimilarity.score,
    bodySimilarityStatus: bodySimilarity.status,
    similarityMetadata: {
      version: 1,
      draft: {
        length: draftText?.length ?? 0,
        comparableBodyLength: bodySimilarity.comparableDraftLength,
      },
      sent: {
        selectedBodySource: bodySimilarity.selectedBodySource,
        extractedReplyLength: sentText?.length ?? 0,
        comparableBodyLength: bodySimilarity.comparableSentLength,
        fullBodyAvailable: bodySimilarity.fullSentBodyAvailable,
      },
      lifecycle: {
        draftExists,
        sentMessageRepliesToSource,
      },
    } satisfies Prisma.InputJsonObject,
  };
}

type BodySimilarityResult = {
  score: number | null;
  status: BodySimilarityStatus;
  comparableDraftLength: number;
  comparableSentLength: number;
  fullSentBodyAvailable: boolean;
  selectedBodySource: ReturnType<typeof getSelectedProviderBodySource>;
};

function getBodySimilarityResult({
  draftText,
  sentMessage,
  sentText,
  accountSignature,
}: {
  draftText?: string | null;
  sentMessage: ParsedMessage;
  sentText: string | null;
  accountSignature?: string | null;
}): BodySimilarityResult {
  const selectedBodySource = getSelectedProviderBodySource(sentMessage);
  const comparableDraftText = stripReferralSignature(draftText ?? "");
  const comparableSentText = stripReferralSignature(sentText ?? "");
  const base = {
    comparableDraftLength: comparableDraftText.length,
    comparableSentLength: comparableSentText.length,
    fullSentBodyAvailable:
      selectedBodySource === "html" || selectedBodySource === "plain",
    selectedBodySource,
  };

  const unscoredStatus = getUnscorableBodySimilarityStatus({
    selectedBodySource,
    comparableDraftText,
    comparableSentText,
  });
  if (unscoredStatus) {
    return { ...base, score: null, status: unscoredStatus };
  }

  return {
    ...base,
    score: calculateSimilarity(comparableDraftText, comparableSentText, {
      excludedSignatures: accountSignature ? [accountSignature] : [],
    }),
    status: BODY_SIMILARITY_STATUS.SCORED,
  };
}

function getUnscorableBodySimilarityStatus({
  selectedBodySource,
  comparableDraftText,
  comparableSentText,
}: {
  selectedBodySource: ReturnType<typeof getSelectedProviderBodySource>;
  comparableDraftText: string;
  comparableSentText: string;
}) {
  if (selectedBodySource === "none")
    return BODY_SIMILARITY_STATUS.MISSING_SENT_BODY;
  if (selectedBodySource === "snippet")
    return BODY_SIMILARITY_STATUS.SNIPPET_ONLY_SENT_BODY;
  if (!comparableSentText.trim()) return BODY_SIMILARITY_STATUS.EMPTY_SENT_TEXT;
  if (!comparableDraftText.trim())
    return BODY_SIMILARITY_STATUS.MISSING_DRAFT_TEXT;
  return null;
}

function getSelectedProviderBodySource(
  message: ParsedMessage,
): "html" | "plain" | "snippet" | "none" {
  if (message.textHtml) return "html";
  if (message.textPlain) return "plain";
  if (message.snippet) return "snippet";
  return "none";
}
