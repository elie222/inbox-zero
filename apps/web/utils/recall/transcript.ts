import { createScopedLogger } from "@/utils/logger";
import { recallRequest } from "@/utils/recall/request";
import type {
  TranscriptMetadataResponse,
  TranscriptContent,
} from "@/app/api/recall/webhook/types";

const logger = createScopedLogger("recall/transcript");

export async function getTranscriptMetadata(
  transcriptId: string,
): Promise<TranscriptMetadataResponse> {
  try {
    return await recallRequest<TranscriptMetadataResponse>(
      `/api/v1/transcript/${transcriptId}`,
    );
  } catch (error) {
    logger.error("Failed to get transcript metadata", {
      transcriptId,
      error,
    });
    throw error;
  }
}

export async function fetchTranscriptContent(
  downloadUrl: string,
): Promise<TranscriptContent> {
  const response = await fetch(downloadUrl);

  if (!response.ok) {
    logger.error("Failed to fetch transcript content", {
      downloadUrl,
      status: response.status,
    });
    throw new Error(`Failed to fetch transcript content: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return await response.clone().json();
    } catch (error) {
      const text = await response.text();
      logger.warn("Transcript JSON parse failed, falling back to text", {
        error: error instanceof Error ? error.message : error,
      });
      return text;
    }
  }

  return response.text();
}
