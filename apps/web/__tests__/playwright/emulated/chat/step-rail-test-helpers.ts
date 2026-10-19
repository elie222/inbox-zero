import { Client } from "pg";

export const STEP_RAIL_CHATS = {
  midRun: { id: "playwright-step-rail-mid-run", name: "Step rail mid-run" },
  finished: { id: "playwright-step-rail-finished", name: "Step rail finished" },
} as const;

const SEARCH_RESULTS = Array.from({ length: 6 }, (_, index) => ({
  messageId: `message-${index}`,
  threadId: `thread-${index}`,
  subject: `Statement ${index + 1}`,
  from: "alerts@chase.example",
  snippet: "Your statement is ready",
  date: "2026-10-19T09:00:00Z",
  isUnread: true,
}));

export async function seedStepRailChats(emailAccountId: string) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await deleteStepRailChats(client);
    for (const [key, chat] of Object.entries(STEP_RAIL_CHATS)) {
      const finished = key === "finished";
      await client.query(
        `INSERT INTO "Chat" (id, "emailAccountId", name, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [chat.id, emailAccountId, chat.name],
      );
      await client.query(
        `INSERT INTO "ChatMessage" (id, "chatId", role, parts, metadata, "createdAt", "updatedAt")
         VALUES ($1, $2, 'user', $3::jsonb, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
                ($4, $2, 'assistant', $5::jsonb, $6::jsonb, CURRENT_TIMESTAMP + interval '1 second', CURRENT_TIMESTAMP)`,
        [
          `${chat.id}-user`,
          chat.id,
          JSON.stringify([
            {
              type: "text",
              text: "Run my rules on the latest Chase email, then archive today's newsletters",
            },
          ]),
          `${chat.id}-assistant`,
          JSON.stringify(stepRailParts({ finished })),
          finished
            ? JSON.stringify({
                schemaVersion: 1,
                assistantRun: {
                  modelName: "gemma4 12B",
                  thinking: "off",
                  durationMs: 8400,
                },
              })
            : null,
        ],
      );
    }
  } finally {
    await client.end();
  }
}

export async function cleanupStepRailChats() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await deleteStepRailChats(client);
  } finally {
    await client.end();
  }
}

function stepRailParts({ finished }: { finished: boolean }) {
  const parts: unknown[] = [
    {
      type: "reasoning",
      text: "Search for the Chase email first, then run the rules on it.",
      state: "done",
    },
    {
      type: "tool-searchInbox",
      toolCallId: "step-rail-search",
      state: "output-available",
      input: { query: "Chase" },
      output: {
        queryUsed: "Chase",
        messages: SEARCH_RESULTS,
        totalReturned: 6,
        hasMore: false,
      },
    },
    {
      type: "tool-runRulesOnEmail",
      toolCallId: "step-rail-rules",
      state: "output-available",
      input: { messageId: "message-0", apply: false },
      output: {
        messageId: "message-0",
        preview: true,
        results: [
          {
            ruleName: "Bills",
            reason: "Looks like a statement",
            status: "APPLIED",
            alreadyProcessed: false,
            actions: [],
          },
        ],
      },
    },
    {
      type: "tool-readEmail",
      toolCallId: "step-rail-read",
      state: "output-available",
      input: { messageId: "message-9" },
      output: { error: "Message was deleted" },
    },
    finished
      ? {
          type: "tool-manageInbox",
          toolCallId: "step-rail-archive",
          state: "output-available",
          input: { action: "archive_threads", threadIds: ["thread-1"] },
          output: {
            action: "archive_threads",
            successCount: 4,
            requestedCount: 4,
          },
        }
      : {
          type: "tool-manageInbox",
          toolCallId: "step-rail-archive",
          state: "input-available",
          input: { action: "archive_threads", threadIds: ["thread-1"] },
        },
  ];
  if (finished) {
    parts.push({
      type: "text",
      text: "I archived 4 newsletters. One email couldn't be read because it was deleted.",
    });
  }
  return parts;
}

async function deleteStepRailChats(client: Client) {
  await client.query(`DELETE FROM "Chat" WHERE id = ANY($1)`, [
    Object.values(STEP_RAIL_CHATS).map((chat) => chat.id),
  ]);
}
