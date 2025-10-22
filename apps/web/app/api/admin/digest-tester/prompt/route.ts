import { NextResponse } from "next/server";
import { auth } from "@/utils/auth";
import { isAdmin } from "@/utils/admin";
import { withError } from "@/utils/middleware";
import fs from "node:fs/promises";
import path from "node:path";

export const GET = withError(async (_request) => {
  const session = await auth();
  if (!isAdmin({ email: session?.user.email })) {
    return new NextResponse("Unauthorized", { status: 403 });
  }

  // Read prompt from production file
  const filePath = path.join(
    process.cwd(),
    "utils/ai/digest/summarize-email-for-digest.ts",
  );

  const content = await fs.readFile(filePath, "utf-8");

  // Extract system prompt (find text between const system = ` and next `)
  const startMarker = "const system = `";
  const endMarker = "`;";
  const startIndex = content.indexOf(startMarker);

  let prompt = "Prompt not found";
  if (startIndex !== -1) {
    const promptStart = startIndex + startMarker.length;
    const promptEnd = content.indexOf(endMarker, promptStart);
    if (promptEnd !== -1) {
      prompt = content.substring(promptStart, promptEnd);
    }
  }

  return NextResponse.json({
    prompt,
    file: "utils/ai/digest/summarize-email-for-digest.ts",
  });
});

export const dynamic = "force-dynamic";
