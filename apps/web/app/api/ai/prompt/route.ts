import { NextResponse } from "next/server";
import {
  createFilterFromPrompt,
  promptQuery,
} from "@/app/api/ai/prompt/controller";
import { withError } from "@/utils/middleware";

export const dynamic = "force-dynamic";

export const GET = withError(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const message = searchParams.get("message");
  const query = promptQuery.parse({ message });

  const res = await createFilterFromPrompt(query);

  return NextResponse.json(res);
});
