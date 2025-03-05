import { z } from "zod";
import { type NextRequest, NextResponse } from "next/server";
import { withError } from "@/utils/middleware";

export const cleanGmailSchema = z.object({
  userId: z.string(),
  threadId: z.string(),
  archive: z.boolean(),
  labelId: z.string().optional(),
});
export type CleanGmailBody = z.infer<typeof cleanGmailSchema>;

// TODO: security
export const POST = withError(async (request: NextRequest) => {
  const json = await request.json();
  const body = cleanGmailSchema.parse(json);

  const result = {};
  return NextResponse.json(result);
});
