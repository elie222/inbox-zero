/**
 * TEST ENDPOINT - Remove before production!
 * Tests Claude Code streaming without authentication.
 */
import { NextResponse } from "next/server";
import { chatCompletionStream } from "@/utils/llms/chat-completion-stream";

export const POST = async (request: Request) => {
  const json = await request.json();
  const { prompt } = json;

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  // Mock user AI settings - uses DEFAULT_LLM_PROVIDER from env
  const userAi = {
    aiProvider: null,
    aiModel: null,
    aiApiKey: null,
  };

  const response = await chatCompletionStream({
    userAi,
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant. Keep responses brief.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    userEmail: "test@example.com",
    usageLabel: "Test stream",
  });

  return response.toTextStreamResponse();
};
