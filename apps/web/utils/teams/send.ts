import type { BriefingContent } from "@inboxzero/resend/emails/meeting-briefing";
import { decodeTeamsTargetId } from "./target-id";

export async function sendTeamsMessageToTarget({
  accessToken,
  targetId,
  text,
}: {
  accessToken: string;
  targetId: string;
  text: string;
}): Promise<{ messageId: string | null }> {
  const decoded = decodeTeamsTargetId(targetId);
  if (!decoded) {
    throw new Error("Invalid Teams destination");
  }

  const { teamId, channelId } = decoded;

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        body: {
          contentType: "html",
          content: toTeamsHtml(text),
        },
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Failed to send Teams message (${response.status}): ${errorBody || response.statusText}`,
    );
  }

  const result = (await response.json().catch(() => ({}))) as { id?: string };

  return { messageId: result.id ?? null };
}

export async function sendChannelConfirmationToTeams({
  accessToken,
  targetId,
}: {
  accessToken: string;
  targetId: string;
}): Promise<void> {
  await sendTeamsMessageToTarget({
    accessToken,
    targetId,
    text: "Inbox Zero connected. Meeting briefings and filing notifications will be delivered to this Teams channel.",
  });
}

export async function sendMeetingBriefingToTeams({
  accessToken,
  targetId,
  meetingTitle,
  formattedTime,
  videoConferenceLink,
  eventUrl,
  briefingContent,
}: {
  accessToken: string;
  targetId: string;
  meetingTitle: string;
  formattedTime: string;
  videoConferenceLink?: string;
  eventUrl?: string;
  briefingContent: BriefingContent;
}): Promise<void> {
  const lines: string[] = [
    `Briefing for ${meetingTitle}`,
    `Starting at ${formattedTime}`,
  ];

  if (videoConferenceLink) lines.push(`Join link: ${videoConferenceLink}`);
  if (eventUrl) lines.push(`Calendar link: ${eventUrl}`);

  for (const guest of briefingContent.guests) {
    lines.push("", `${guest.name} (${guest.email})`);
    for (const bullet of guest.bullets) {
      lines.push(`- ${bullet}`);
    }
  }

  const teamMemberNames = (briefingContent.internalTeamMembers ?? [])
    .map((member) => member.name || member.email)
    .filter(Boolean);

  if (teamMemberNames.length > 0) {
    lines.push("", `Also attending: ${teamMemberNames.join(", ")}`);
  }

  await sendTeamsMessageToTarget({
    accessToken,
    targetId,
    text: lines.join("\n"),
  });
}

export async function sendDocumentFiledToTeams({
  accessToken,
  targetId,
  filename,
  folderPath,
  driveProvider,
}: {
  accessToken: string;
  targetId: string;
  filename: string;
  folderPath: string;
  driveProvider: string;
}): Promise<void> {
  await sendTeamsMessageToTarget({
    accessToken,
    targetId,
    text: `Filed ${filename} to ${folderPath} (${driveProvider}).`,
  });
}

export async function sendDocumentAskToTeams({
  accessToken,
  targetId,
  filename,
  reasoning,
}: {
  accessToken: string;
  targetId: string;
  filename: string;
  reasoning: string;
}): Promise<void> {
  await sendTeamsMessageToTarget({
    accessToken,
    targetId,
    text: `Where should I file ${filename}?\n\n${reasoning}`,
  });
}

function toTeamsHtml(text: string): string {
  return escapeHtml(text).replaceAll("\n", "<br/>");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
