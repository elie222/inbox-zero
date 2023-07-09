import { NextResponse } from "next/server";
import { createFilterFromPrompt } from "@/utils/actions";
import { z } from "zod";

export const promptQuery = z.object({ message: z.string() });
export type PromptQuery = z.infer<typeof promptQuery>;
export type PromptResponse = Awaited<ReturnType<typeof prompt>>;

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const message = searchParams.get('message')
  const query = promptQuery.parse({ message });

  const res = await createFilterFromPrompt(query);

  return NextResponse.json(res);
}

