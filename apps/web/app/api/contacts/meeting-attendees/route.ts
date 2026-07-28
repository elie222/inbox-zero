import { NextResponse } from "next/server";
import { getMeetingAttendeeSuggestions } from "@/utils/contacts/meeting-attendees";
import { withEmailAccount } from "@/utils/middleware";

export type MeetingAttendeesResponse = Awaited<
  ReturnType<typeof getMeetingAttendeeSuggestions>
>;

// People from your calendar invites who aren't saved contacts yet. Ignored
// addresses and domains are already filtered out, so the list only holds
// people you could act on.
export const GET = withEmailAccount(
  "contacts/meeting-attendees",
  async (request) => {
    const { emailAccountId, email } = request.auth;

    const attendees = await getMeetingAttendeeSuggestions({
      emailAccountId,
      userEmail: email,
      logger: request.logger,
    });

    return NextResponse.json(attendees);
  },
);
