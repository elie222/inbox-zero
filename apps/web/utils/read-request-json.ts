import { NextResponse } from "next/server";

export async function readRequestJson(
  request: Request,
): Promise<{ json: unknown } | { response: NextResponse }> {
  try {
    return { json: await request.json() };
  } catch {
    return {
      response: NextResponse.json(
        { error: "Invalid JSON body", isKnownError: true },
        { status: 400 },
      ),
    };
  }
}
