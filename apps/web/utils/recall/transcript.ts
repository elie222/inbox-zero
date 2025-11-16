import { createScopedLogger } from "@/utils/logger";
import { recallRequest } from "@/utils/recall/request";
import type {
  TranscriptMetadataResponse,
  TranscriptContent,
} from "@/app/api/recall/webhook/types";

const logger = createScopedLogger("recall/transcript");

export interface CreateAsyncTranscriptRequest {
  language?: string;
  provider: {
    recallai_async?: {
      model?: string;
    };
  };
}

export interface CreateAsyncTranscriptResponse {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export async function createAsyncTranscript(
  recordingId: string,
  request: CreateAsyncTranscriptRequest,
): Promise<CreateAsyncTranscriptResponse> {
  try {
    return await recallRequest<CreateAsyncTranscriptResponse>(
      `/api/v1/recording/${recordingId}/create_transcript/`,
      {
        method: "POST",
        body: JSON.stringify(request),
      },
    );
  } catch (error) {
    logger.error("Failed to create async transcript", {
      recordingId,
      error,
    });
    throw error;
  }
}

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
