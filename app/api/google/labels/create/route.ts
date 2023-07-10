import { google } from "googleapis";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/utils/auth";
import { getClient } from "@/utils/google";
import { withError } from "@/utils/middleware";

const createLabelBody = z.object({ name: z.string() });
export type CreateLabelBody = z.infer<typeof createLabelBody>;
export type CreateLabelResponse = Awaited<ReturnType<typeof createLabel>>;

export async function createLabel(body: CreateLabelBody) {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  const auth = getClient(session);

  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.labels.create({
    userId: "me",
    requestBody: { name: body.name },
  });
  const label = res.data;

  return { label };
}

export const POST = withError(async (request: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = createLabelBody.parse(json);
  const label = await createLabel(body);

  return NextResponse.json(label);
});
