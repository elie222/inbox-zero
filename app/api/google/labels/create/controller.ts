import { z } from "zod";
import { google } from "googleapis";
import { getClient } from "@/utils/google";
import { getSession } from "@/utils/auth";

export const createLabelBody = z.object({ name: z.string() });
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
