import { NextResponse } from "next/server";
import { z } from "zod";
import { subDays } from "date-fns";
import { getNewSenders } from "@inboxzero/tinybird";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import {
  filterNewsletters,
  findAutoArchiveFilter,
  findNewsletterStatus,
  getAutoArchiveFilters,
} from "@/app/api/user/stats/newsletters/helpers";

const newSendersQuery = z.object({
  cutOffDate: z.coerce.number().nullish(),
  filters: z
    .array(
      z.enum(["unhandled", "autoArchived", "unsubscribed", "approved", ""]),
    )
    .optional()
    .transform((arr) => arr?.filter(Boolean)),
});
export type NewSendersQuery = z.infer<typeof newSendersQuery>;
export type NewSendersResponse = Awaited<ReturnType<typeof getNewEmailSenders>>;

async function getNewEmailSenders(
  options: NewSendersQuery & { ownerEmail: string; userId: string },
) {
  const cutOffDate = options.cutOffDate || subDays(new Date(), 7).getTime();

  const newSenders = await getNewSenders({
    ...options,
    cutOffDate,
  });

  const autoArchiveFilters = await getAutoArchiveFilters();
  const userNewsletters = await findNewsletterStatus(options.userId);

  const emails = newSenders.data.map((email) => {
    return {
      ...email,
      name: email.from,
      lastUnsubscribeLink: email.unsubscribeLink,
      autoArchived: findAutoArchiveFilter(autoArchiveFilters, email.from),
      status: userNewsletters?.find((n) => n.email === email.from)?.status,
    };
  });

  if (!options.filters?.length) return { emails };

  return {
    emails: filterNewsletters(emails, options.filters),
  };
}

export const GET = withError(async (request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const { searchParams } = new URL(request.url);

  const query = newSendersQuery.parse({
    cutOffDate: searchParams.get("cutOffDate"),
    filters: searchParams.get("filters")?.split(",") || [],
  });

  const result = await getNewEmailSenders({
    ...query,
    ownerEmail: session.user.email,
    userId: session.user.id,
  });

  return NextResponse.json(result);
});
