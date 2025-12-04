import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";

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
  const response = await fetch(`${baseUrl}/api/tags`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Ollama models: ${response.statusText}`);
  }

  const data = (await response.json()) as OllamaModelsResponse;
  return data.models || [];
}

export async function GET(req: NextRequest) {
  const baseUrl = env.OLLAMA_BASE_URL || "http://localhost:11434";

  try {
    const models = await getOllamaModels(baseUrl);
    return NextResponse.json(models);
  } catch (error) {
    console.error("Failed to get Ollama models", { error });
    return NextResponse.json(
      { error: "Failed to fetch Ollama models" },
      { status: 500 },
    );
  }
}
