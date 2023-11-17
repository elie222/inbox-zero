import { NextResponse } from "next/server";
import { z } from "zod";
import { subDays } from "date-fns";
import { getNewSenders } from "@inboxzero/tinybird";
import { auth } from "@/app/api/auth/[...nextauth]/auth";

const newSendersQuery = z.object({
  cutOffDate: z.coerce.number().nullish(),
});
export type NewSendersQuery = z.infer<typeof newSendersQuery>;
export type NewSendersResponse = Awaited<ReturnType<typeof getNewEmailSenders>>;

async function getNewEmailSenders(
  options: NewSendersQuery & { ownerEmail: string }
) {
  const cutOffDate = options.cutOffDate || subDays(new Date(), 7).getTime();

  const newSenders = await getNewSenders({
    ...options,
    cutOffDate,
  });

  return { emails: newSenders.data };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const { searchParams } = new URL(request.url);

  const query = newSendersQuery.parse({
    cutOffDate: searchParams.get("cutOffDate"),
    types: searchParams.get("types")?.split(",") || [],
  });

  const result = await getNewEmailSenders({
    ...query,
    ownerEmail: session.user.email,
  });

  return NextResponse.json(result);
}
