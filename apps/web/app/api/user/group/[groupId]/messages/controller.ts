import prisma from "@/utils/prisma";
import type { gmail_v1 } from "@googleapis/gmail";
import { createHash } from "node:crypto";
import groupBy from "lodash/groupBy";
import { getMessage, getMessages } from "@/utils/gmail/message";
import { findMatchingGroupItem } from "@/utils/group/find-matching-group";
import { parseMessage } from "@/utils/gmail/message";
import { extractEmailAddress } from "@/utils/email";
import { type GroupItem, GroupItemType } from "@prisma/client";
import type { MessageWithGroupItem } from "@/app/(app)/[emailAccountId]/assistant/rule/[ruleId]/examples/types";
import { SafeError } from "@/utils/error";

const PAGE_SIZE = 20;

interface InternalPaginationState {
  type: GroupItemType;
  chunkIndex: number;
  pageToken?: string;
  groupItemsHash: string;
}

export type GroupEmailsResponse = Awaited<ReturnType<typeof getGroupEmails>>;

export async function getGroupEmails({
  groupId,
  emailAccountId,
  gmail,
  from,
  to,
  pageToken,
}: {
  groupId: string;
  emailAccountId: string;
  gmail: gmail_v1.Gmail;
  from?: Date;
  to?: Date;
  pageToken?: string;
}) {
  const group = await prisma.group.findUnique({
    where: { id: groupId, emailAccountId },
    include: { items: true },
  });

  if (!group) throw new SafeError("Group not found");

  const { messages, nextPageToken } = await fetchPaginatedMessages({
    groupItems: group.items,
    gmail,
    from,
    to,
    pageToken,
  });

  return { messages, nextPageToken };
}

export async function fetchPaginatedMessages({
  groupItems,
  gmail,
  from,
  to,
  pageToken,
}: {
  groupItems: GroupItem[];
  gmail: gmail_v1.Gmail;
  from?: Date;
  to?: Date;
  pageToken?: string;
}) {
  const groupItemsHash = createGroupItemsHash(groupItems);
  let paginationState: InternalPaginationState;

  const defaultPaginationState = {
    type: GroupItemType.FROM,
    chunkIndex: 0,
    groupItemsHash,
  };

  if (pageToken) {
    try {
      const decodedState = JSON.parse(
        Buffer.from(pageToken, "base64").toString("utf-8"),
      );
      if (decodedState.groupItemsHash === groupItemsHash) {
        paginationState = decodedState;
      } else {
        // Group items have changed, start from the beginning
        paginationState = defaultPaginationState;
      }
    } catch (error) {
      // Invalid pageToken, start from the beginning
      paginationState = defaultPaginationState;
    }
  } else {
    paginationState = defaultPaginationState;
  }

  const { messages, nextPaginationState } = await fetchPaginatedGroupMessages(
    groupItems,
    gmail,
    from,
    to,
    paginationState,
  );

  const nextPageToken = nextPaginationState
    ? Buffer.from(JSON.stringify(nextPaginationState)).toString("base64")
    : undefined;

  return { messages, nextPageToken };
}

// used for pagination
// if the group items change, we start from the beginning
function createGroupItemsHash(
  groupItems: { type: string; value: string }[],
): string {
  const itemsString = JSON.stringify(
    groupItems.map((item) => ({ type: item.type, value: item.value })),
  );
  return createHash("md5").update(itemsString).digest("hex");
}

// we set up our own pagination
// as we have to paginate through multiple types
// and for each type, through multiple chunks
async function fetchPaginatedGroupMessages(
  groupItems: GroupItem[],
  gmail: gmail_v1.Gmail,
  from: Date | undefined,
  to: Date | undefined,
  paginationState: InternalPaginationState,
): Promise<{
  messages: MessageWithGroupItem[];
  nextPaginationState?: InternalPaginationState;
}> {
  const CHUNK_SIZE = PAGE_SIZE;

  const groupItemTypes: GroupItemType[] = [
    GroupItemType.FROM,
    GroupItemType.SUBJECT,
  ];
  const groupItemsByType = groupBy(groupItems, (item) => item.type);

  let messages: MessageWithGroupItem[] = [];
  let nextPaginationState: InternalPaginationState | undefined;

  const processChunk = async (type: GroupItemType) => {
    const items = groupItemsByType[type] || [];
    while (paginationState.type === type && messages.length < PAGE_SIZE) {
      const chunk = items.slice(
        paginationState.chunkIndex * CHUNK_SIZE,
        (paginationState.chunkIndex + 1) * CHUNK_SIZE,
      );
      if (chunk.length === 0) break;

      const result = await fetchGroupMessages(
        type,
        chunk,
        gmail,
        PAGE_SIZE - messages.length,
        from,
        to,
        paginationState.pageToken,
      );
      messages = [...messages, ...result.messages];

      if (result.nextPageToken) {
        nextPaginationState = {
          type,
          chunkIndex: paginationState.chunkIndex,
          pageToken: result.nextPageToken,
          groupItemsHash: paginationState.groupItemsHash,
        };
        break;
      }
      paginationState.chunkIndex++;
      paginationState.pageToken = undefined;
    }
  };

  for (const type of groupItemTypes) {
    if (messages.length < PAGE_SIZE) {
      await processChunk(type);
    } else {
      break;
    }
  }

  // Handle transition to the next GroupItemType if current type is exhausted
  // This ensures we paginate through all types in order
  if (!nextPaginationState && messages.length < PAGE_SIZE) {
    const nextTypeIndex = groupItemTypes.indexOf(paginationState.type) + 1;
    if (nextTypeIndex < groupItemTypes.length) {
      nextPaginationState = {
        type: groupItemTypes[nextTypeIndex],
        chunkIndex: 0,
        groupItemsHash: paginationState.groupItemsHash,
      };
    }
  }

  return { messages, nextPaginationState };
}

async function fetchGroupMessages(
  groupItemType: GroupItemType,
  groupItems: GroupItem[],
  gmail: gmail_v1.Gmail,
  maxResults: number,
  from?: Date,
  to?: Date,
  pageToken?: string,
): Promise<{ messages: MessageWithGroupItem[]; nextPageToken?: string }> {
  const query = buildQuery(groupItemType, groupItems, from, to);

  const response = await getMessages(gmail, {
    query,
    maxResults,
    pageToken,
  });

  const messages = await Promise.all(
    (response.messages || []).map(async (message) => {
      // TODO: Use email provider to get the message which will parse it internally
      const m = await getMessage(message.id!, gmail);
      const parsedMessage = parseMessage(m);
      const matchingGroupItem = findMatchingGroupItem(
        parsedMessage.headers,
        groupItems,
      );
      return { ...parsedMessage, matchingGroupItem };
    }),
  );

  return {
    // search might include messages that don't match the rule, so we filter those out
    messages: messages.filter((message) => message.matchingGroupItem),
    nextPageToken: response.nextPageToken || undefined,
  };
}

function buildQuery(
  groupItemType: GroupItemType,
  groupItems: GroupItem[],
  from?: Date,
  to?: Date,
) {
  const beforeQuery = from
    ? `before:${Math.floor(from.getTime() / 1000)} `
    : "";
  const afterQuery = to ? `after:${Math.floor(to.getTime() / 1000)} ` : "";

  if (groupItemType === GroupItemType.FROM) {
    const q = `from:(${groupItems
      .map((item) => `"${extractEmailAddress(item.value) || item.value}"`)
      .join(" OR ")}) ${beforeQuery}${afterQuery}`;
    return q;
  }

  if (groupItemType === GroupItemType.SUBJECT) {
    const q = `subject:(${groupItems
      .map((item) => `"${item.value}"`)
      .join(" OR ")}) ${beforeQuery}${afterQuery}`;
    return q;
  }

  return "";
}
