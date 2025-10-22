import { NextResponse } from "next/server";
import { auth } from "@/utils/auth";
import { isAdmin } from "@/utils/admin";
import { withError } from "@/utils/middleware";
import { getGmailClientForEmail } from "@/utils/account";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("admin/digest-tester");

export const GET = withError(async (request) => {
  const session = await auth();
  if (!isAdmin({ email: session?.user.email })) {
    return new NextResponse("Unauthorized", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const emailAccountId = searchParams.get("emailAccountId");
  const customLabel = searchParams.get("label");

  logger.info("Fetching test emails", { emailAccountId, customLabel });

  const gmail = await getGmailClientForEmail({
    emailAccountId: emailAccountId!,
  });

  // Get all labels
  const labelsResponse = await gmail.users.labels.list({ userId: "me" });
  const allLabels = labelsResponse.data.labels || [];

  logger.info("Fetched Gmail labels", {
    totalLabels: allLabels.length,
    userLabels: allLabels.filter((l) => l.type === "user").length,
  });

  // Try multiple label names if custom label not specified
  const labelNamesToTry = customLabel
    ? [customLabel]
    : [
        "inbox-zero-digest-test",
        "digest-test",
        "test-digest",
        "digest",
        "test",
      ];

  let label: { id?: string; name?: string } | null = null;
  let usedLabelName = "";

  // Try exact match first, then case-insensitive
  for (const labelName of labelNamesToTry) {
    // Try exact match
    label = allLabels.find((l) => l.name === labelName) || null;
    if (label) {
      usedLabelName = label.name || labelName;
      break;
    }
    // Try case-insensitive
    label =
      allLabels.find(
        (l) => l.name?.toLowerCase() === labelName.toLowerCase(),
      ) || null;
    if (label) {
      usedLabelName = label.name || labelName;
      break;
    }
  }

  if (!label?.id) {
    // Return helpful error with available labels
    const userLabels = allLabels
      .filter((l) => l.type === "user")
      .map((l) => l.name)
      .slice(0, 50);

    logger.warn("No test label found", {
      labelNamesToTry,
      availableUserLabels: userLabels,
    });

    return NextResponse.json({
      error: `No test label found. Tried: ${labelNamesToTry.join(", ")}`,
      availableLabels: userLabels,
      suggestion: "Type the exact label name from Gmail above",
      emails: [],
    });
  }

  logger.info("Found label", { labelName: usedLabelName, labelId: label.id });

  // Get messages with label
  const messagesResponse = await gmail.users.messages.list({
    userId: "me",
    labelIds: [label.id],
    maxResults: 50,
  });

  const messageIds = messagesResponse.data.messages?.map((m) => m.id!) || [];

  logger.info("Found messages with label", {
    messageCount: messageIds.length,
    labelName: usedLabelName,
  });

  // Fetch metadata
  const emails = await Promise.all(
    messageIds.map(async (id: string) => {
      const message = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });

      const headers = message.data.payload?.headers || [];
      type Header = { name?: string; value?: string };
      return {
        messageId: id,
        from: headers.find((h: Header) => h.name === "From")?.value || "",
        subject: headers.find((h: Header) => h.name === "Subject")?.value || "",
        date: headers.find((h: Header) => h.name === "Date")?.value || "",
      };
    }),
  );

  return NextResponse.json({
    emails,
    labelId: label.id,
    labelName: usedLabelName,
  });
});
