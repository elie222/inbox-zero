import type { Logger } from "@/utils/logger";
import { withMicrosoftGraphRetry } from "@/utils/microsoft/retry";
import type { OutlookClient } from "@/utils/outlook/client";
import { normalizeContactCandidates } from "@/utils/email/contact";

type OutlookPerson = {
  displayName?: string | null;
  scoredEmailAddresses?: Array<{ address?: string | null }> | null;
  userPrincipalName?: string | null;
};

export async function searchContacts(
  client: OutlookClient,
  query: string,
  logger: Logger,
) {
  let request = client
    .getClient()
    .api("/me/people")
    .select("displayName,scoredEmailAddresses,userPrincipalName");

  const trimmedQuery = query.trim();
  if (trimmedQuery) request = request.search(trimmedQuery);

  const response: { value?: OutlookPerson[] } = await withMicrosoftGraphRetry(
    () => request.top(10).get(),
    logger,
  );

  return normalizeContactCandidates(
    response.value?.flatMap((person) => {
      const addresses = person.scoredEmailAddresses?.length
        ? person.scoredEmailAddresses.map((email) => email.address)
        : [person.userPrincipalName];

      return addresses.flatMap((emailAddress) =>
        emailAddress
          ? [
              {
                emailAddress,
                name: person.displayName ?? undefined,
              },
            ]
          : [],
      );
    }) ?? [],
  );
}
