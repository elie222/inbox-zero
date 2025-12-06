import { NextResponse } from "next/server";
import { allowUserAiProviderUrl } from "@/utils/llms/config";
import { withEmailAccount } from "@/utils/middleware";

export type LmStudioModel = {
  id: string;
  object: string;
  type: string;
  publisher: string;
  arch: string;
  compatibility_type: string;
  quantization: string;
  state: "loaded" | "not-loaded";
  max_context_length: number;
};

export type LmStudioModelsResponse = {
  object: string;
  data: LmStudioModel[];
};

async function getLmStudioModels(baseUrl: string): Promise<LmStudioModel[]> {
  // Normalize URL - remove trailing slashes and /v1 if present
  const normalizedUrl = baseUrl.replace(/\/v1\/?$/, "").replace(/\/+$/, "");

  const response = await fetch(`${normalizedUrl}/api/v0/models`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    // Timeout after 10 seconds to prevent hanging requests
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch LM Studio models: ${response.statusText}`);
  }

  const data = (await response.json()) as LmStudioModelsResponse;
  // Filter to only return LLM models (not embeddings or VLMs for now)
  return (data.data || []).filter((model) => model.type === "llm");
}

export const GET = withEmailAccount("api/ai/lmstudio-models", async (req) => {
  // LM Studio requires user to provide their own URL
  if (!allowUserAiProviderUrl) {
    return NextResponse.json(
      { error: "LM Studio is not enabled on this server" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(req.url);
  const baseUrl = searchParams.get("baseUrl");

  if (!baseUrl) {
    return NextResponse.json(
      { error: "baseUrl parameter is required for LM Studio" },
      { status: 400 },
    );
  }

  try {
    const models = await getLmStudioModels(baseUrl);
    return NextResponse.json(models);
  } catch (error) {
    req.logger.error("Failed to get LM Studio models", { error, baseUrl });
    return NextResponse.json(
      {
        error:
          "Failed to fetch LM Studio models. Make sure LM Studio server is running.",
      },
      { status: 500 },
    );
  }
});
