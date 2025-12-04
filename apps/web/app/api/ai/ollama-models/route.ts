import { NextResponse } from "next/server";
import { env } from "@/env";
import { allowUserAiProviderUrl } from "@/utils/llms/config";
import { withEmailAccount } from "@/utils/middleware";

export type OllamaModel = {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
};

export type OllamaModelsResponse = {
  models: OllamaModel[];
};

async function getOllamaModels(baseUrl: string): Promise<OllamaModel[]> {
  // Normalize URL - remove trailing /api if present since we add it
  const normalizedUrl = baseUrl.replace(/\/api\/?$/, "");

  const response = await fetch(`${normalizedUrl}/api/tags`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    // Timeout after 10 seconds to prevent hanging requests
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Ollama models: ${response.statusText}`);
  }

  const data = (await response.json()) as OllamaModelsResponse;
  return data.models || [];
}

export const GET = withEmailAccount("api/ai/ollama-models", async (req) => {
  // Only allow custom URL if the feature is enabled via env var
  const { searchParams } = new URL(req.url);
  const customUrl = searchParams.get("baseUrl");

  // Security: Only use custom URL if ALLOW_USER_AI_PROVIDER_URL is enabled
  // Note: URL should include /api (e.g., http://localhost:11434/api)
  const baseUrl =
    allowUserAiProviderUrl && customUrl
      ? customUrl
      : env.OLLAMA_BASE_URL || "http://localhost:11434/api";

  try {
    const models = await getOllamaModels(baseUrl);
    return NextResponse.json(models);
  } catch (error) {
    req.logger.error("Failed to get Ollama models", { error });
    return NextResponse.json(
      { error: "Failed to fetch Ollama models" },
      { status: 500 },
    );
  }
});
