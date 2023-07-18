import "server-only";
import prisma from "@/utils/prisma";
import { RedisLabel, getLabels, saveLabels } from "@/utils/redis/label";
import { gmail_v1 } from "googleapis";

// export const recommendedLabels = [
//   "Newsletter",
//   "Receipt",
//   'Calendar',
// ];

export const inboxZeroLabels = [
  "[InboxZero]/Archived by IZ",
  "[InboxZero]/Labeled by IZ",
  "[InboxZero]/Response Drafted by IZ",
  "[InboxZero]/Label Suggested by IZ",
];

export const INBOX_LABEL_ID = "INBOX";

export async function getGmailLabels(gmail: gmail_v1.Gmail) {
  const res = await gmail.users.labels.list({ userId: "me" });
  return res.data.labels;
}

async function createGmailLabel(options: {
  name: string;
  gmail: gmail_v1.Gmail;
}) {
  const { name, gmail } = options;

  const res = await gmail.users.labels.create({
    requestBody: {
      name,
      color: {
        backgroundColor: "#000000",
        textColor: "#ffffff",
      },
      labelListVisibility: "show",
      messageListVisibility: "show",
    },
  });

  return res.data;
}

export async function getUserLabels(
  email: string,
  gmail: gmail_v1.Gmail
): Promise<RedisLabel[] | null> {
  // 1. when we plan to use the label, we should check if the label exists in redis
  const redisLabels = await getLabels({ email });
  if (redisLabels) return redisLabels;

  // 2. if not check if it exists in the db
  const dbLabels = await prisma.label.findMany({
    where: { user: { email }, enabled: true },
  });
  if (dbLabels) {
    await saveLabels({ email, labels: dbLabels });
    return dbLabels;
  }

  // 3. if not then create the IZ labels in gmail and store them in our db and redis
  const gmailLabels = await Promise.all(
    inboxZeroLabels.map((l) => {
      return createGmailLabel({ name: l, gmail });
    })
  );

  const savedLabels = await prisma.$transaction(
    gmailLabels.map((l) => {
      return prisma.label.create({
        data: {
          name: l.name!,
          gmailLabelId: l.id!,
          user: { connect: { email } },
          enabled: true,
        },
      });
    })
  );

  await saveLabels({ email, labels: savedLabels });
  return savedLabels;
}
