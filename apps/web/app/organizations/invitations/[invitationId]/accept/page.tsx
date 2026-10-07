import { redirect } from "next/navigation";
import { AcceptInvitation } from "@/app/organizations/invitations/[invitationId]/accept/AcceptInvitation";
import { auth } from "@/utils/auth";

export default async function AcceptInvitationPage(props: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await props.params;
  const session = await auth();

  // Uses the same session check as the login page, so login never sends the
  // user straight back here while they are still signed out.
  if (!session?.user) {
    redirect(
      `/login?next=${encodeURIComponent(`/organizations/invitations/${invitationId}/accept`)}`,
    );
  }

  return <AcceptInvitation invitationId={invitationId} />;
}
