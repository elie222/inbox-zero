import "server-only";
import { gmail_v1 } from "googleapis";
import prisma from "@/utils/prisma";
import {
  InboxZeroLabelKey,
  InboxZeroLabels,
  RedisLabel,
  getInboxZeroLabels,
  getUserLabels as getRedisUserLabels,
  inboxZeroLabelKeys,
  saveInboxZeroLabel,
  saveUserLabels,
} from "@/utils/redis/label";

export const inboxZeroLabels: Record<InboxZeroLabelKey, string> = {
  archived: "[InboxZero]/Archived by IZ",
  labeled: "[InboxZero]/Labeled by IZ",
  drafted: "[InboxZero]/Response Drafted by IZ",
  suggested_label: "[InboxZero]/Label Suggested by IZ",
};

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

  try {
    const res = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name,
        color: {
          backgroundColor: "#000000",
          textColor: "#ffffff",
        },
        messageListVisibility: "show",
        labelListVisibility: "labelShow",
      },
    });

    return res.data;
  } catch (error) {
    console.error("createGmailLabel error", error);
  }
}

export async function getUserLabels(options: {
  email: string;
}): Promise<RedisLabel[] | null> {
  const { email } = options;

  // 1. check if the labels exist in redis
  const redisLabels = await getRedisUserLabels({ email });
  if (redisLabels?.length) return redisLabels;

  // 2. if not check if the labels exist in the db
  const dbLabels = await prisma.label.findMany({
    where: { user: { email }, enabled: true },
  });
  if (dbLabels.length) {
    await saveUserLabels({ email, labels: dbLabels });
    return dbLabels;
  }

  // no labels found
  return [];
}

export async function getOrCreateInboxZeroLabels(
  email: string,
  gmail: gmail_v1.Gmail
): Promise<InboxZeroLabels> {
  // 1. check redis
  const redisLabels = await getInboxZeroLabels({ email });

  if (
    redisLabels &&
    Object.keys(redisLabels).length === inboxZeroLabelKeys.length
  )
    return redisLabels;

  // 2. if redis doesn't have them then check gmail
  const gmailLabels = await getGmailLabels(gmail);

  // 3. if gmail has them then save them to redis and return them
  const gmailRedisLabels = (
    await Promise.all(
      inboxZeroLabelKeys.map(async (key) => {
        let gmailLabel = gmailLabels?.find(
          (l) => l.name === inboxZeroLabels[key]
        );

        if (!gmailLabel) {
          gmailLabel = await createGmailLabel({
            name: inboxZeroLabels[key],
            gmail,
          });
        }

        if (gmailLabel?.id && gmailLabel?.name) {
          const label = { id: gmailLabel.id, name: gmailLabel.name };
          await saveInboxZeroLabel({
            email,
            labelKey: key,
            label,
          });
          return [key, label] as [InboxZeroLabelKey, RedisLabel];
        }
      })
    )
  ).filter((pair): pair is [InboxZeroLabelKey, RedisLabel] => Boolean(pair));

  const res = Object.fromEntries(gmailRedisLabels) as InboxZeroLabels;
  return res;
}
