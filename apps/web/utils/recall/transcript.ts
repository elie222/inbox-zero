import { createScopedLogger } from "@/utils/logger";
import { recallRequest } from "@/utils/recall/request";
import type {
  TranscriptMetadataResponse,
  TranscriptContent,
} from "@/app/api/recall/webhook/types";

const logger = createScopedLogger("recall/transcript");

export async function createAsyncTranscript(
  recordingId: string,
  options: {
    language?: string;
    useDiarization?: boolean;
  } = {},
): Promise<{ id: string }> {
  const { language = "en", useDiarization = true } = options;

  return recallRequest<{ id: string }>(
    `api/v1/recording/${recordingId}/create_transcript/`,
    {
      method: "POST",
      body: JSON.stringify({
        provider: {
          recallai_async: {
            language_code: language,
          },
        },
        ...(useDiarization && {
          diarization: {
            use_separate_streams_when_available: true,
          },
        }),
      }),
    },
  );
}

export async function getTranscriptMetadata(
  transcriptId: string,
): Promise<TranscriptMetadataResponse> {
  try {
    return await recallRequest<TranscriptMetadataResponse>(
      `api/v1/transcript/${transcriptId}`,
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
      const json = await response.json();
      return json;
    } catch (_e) {
      const text = await response.text();
      logger.warn("Transcript JSON parse failed, falling back to text", {
        body: text,
      });
      return text;
    }
  }
  return response.text();
}
