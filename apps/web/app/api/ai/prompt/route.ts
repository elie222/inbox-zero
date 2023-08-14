import { NextResponse } from "next/server";
import {
  createFilterFromPrompt,
  promptQuery,
} from "@/app/api/ai/prompt/controller";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const message = searchParams.get("message");
  const query = promptQuery.parse({ message });

  const res = await createFilterFromPrompt(query);

  return NextResponse.json(res);
}
