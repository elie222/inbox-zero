import { createServer } from "node:http";

export async function createFastmailEmulator(port: number) {
  const accountId = `fixture-mail-account-${port}`;
  const email = `fastmail-fixture+${port}@example.com`;
  const messages = ["Safety receipt", "Team update"].map((subject, index) => ({
    id: `fixture-message-${index}`,
    threadId: `fixture-thread-${index}`,
    blobId: `fixture-blob-${index}`,
    mailboxIds: { inbox: true } as Record<string, boolean>,
    keywords: {} as Record<string, boolean>,
    size: 100,
    receivedAt: new Date().toISOString(),
    sentAt: new Date().toISOString(),
    from: [{ email: "sender@example.com", name: "Fixture Sender" }],
    to: [{ email: email }],
    subject,
    preview: "Synthetic Fastmail reviewer fixture",
    hasAttachment: false,
    textBody: [{ partId: "text", type: "text/plain" }],
    htmlBody: [],
    attachments: [],
    bodyValues: { text: { value: "Synthetic Fastmail reviewer fixture" } },
    bodyStructure: { partId: "text", type: "text/plain" },
  }));
  const mailboxes = ["inbox", "archive", "drafts", "sent", "junk", "trash"].map(
    (role) => ({
      id: role,
      name: role,
      role,
      totalEmails: role === "inbox" ? 2 : 0,
      unreadEmails: role === "inbox" ? 2 : 0,
      totalThreads: role === "inbox" ? 2 : 0,
      unreadThreads: role === "inbox" ? 2 : 0,
      parentId: null,
      myRights: { mayReadItems: true, mayAddItems: true, mayRemoveItems: true },
    }),
  );
  const calls: unknown[] = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const reply = (body: unknown, status = 200) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (url.pathname === "/health") return reply({ ok: true });
    if (url.pathname === "/__fixture/calls") return reply(calls);
    if (url.pathname === "/__fixture/messages") return reply(messages);
    if (request.headers.authorization !== "Bearer fixture-fastmail-token")
      return reply({ error: "Invalid fixture token" }, 401);
    if (url.pathname === "/jmap/session")
      return reply({
        username: email,
        state: "session-1",
        apiUrl: "https://api.fastmail.com/jmap/api",
        downloadUrl:
          "https://api.fastmail.com/download/{accountId}/{blobId}/{name}?type={type}",
        uploadUrl: "https://api.fastmail.com/upload/{accountId}",
        eventSourceUrl:
          "https://api.fastmail.com/events?types={types}&closeafter={closeafter}&ping={ping}",
        capabilities: {
          "urn:ietf:params:jmap:core": {
            maxObjectsInGet: 100,
            maxObjectsInSet: 100,
          },
          "urn:ietf:params:jmap:mail": {},
          "urn:ietf:params:jmap:submission": {},
        },
        primaryAccounts: {
          "urn:ietf:params:jmap:mail": accountId,
        },
        accounts: {
          [accountId]: {
            name: "Fastmail fixture",
            isPersonal: true,
            isReadOnly: false,
            accountCapabilities: {
              "urn:ietf:params:jmap:mail": {},
              "urn:ietf:params:jmap:submission": {},
            },
          },
        },
      });
    if (url.pathname !== "/jmap/api")
      return reply({ error: "Unknown fixture endpoint" }, 404);
    let body = "";
    for await (const chunk of request) body += chunk.toString();
    const input = JSON.parse(body) as {
      methodCalls: Array<[string, Record<string, unknown>, string]>;
    };
    let ids: string[] = [];
    const methodResponses = input.methodCalls.map(([method, args, id]) => {
      calls.push([method, args]);
      let result: Record<string, unknown>;
      switch (method) {
        case "Mailbox/get":
          result = { list: mailboxes, state: "mailboxes-1", notFound: [] };
          break;
        case "Email/query": {
          const matching = messages.filter((message) =>
            matches(message, args.filter as Record<string, unknown>),
          );
          ids = matching.map((message) => message.id);
          result = {
            ids,
            total: ids.length,
            position: 0,
            queryState: "emails-1",
            canCalculateChanges: true,
          };
          break;
        }
        case "Email/get": {
          const requested = args.ids as string[] | undefined;
          result = {
            list: messages.filter((message) =>
              (requested ?? ids).includes(message.id),
            ),
            state: "emails-1",
            notFound: [],
          };
          break;
        }
        case "Email/changes":
          result = {
            oldState: args.sinceState,
            newState: "emails-1",
            created: [],
            updated: [],
            destroyed: [],
            hasMoreChanges: false,
          };
          break;
        case "Thread/get":
          result = {
            list: messages
              .filter((message) =>
                (args.ids as string[]).includes(message.threadId),
              )
              .map((message) => ({
                id: message.threadId,
                emailIds: [message.id],
              })),
            state: "threads-1",
            notFound: [],
          };
          break;
        case "Identity/get":
          result = {
            list: [
              {
                id: "fixture-identity",
                email: email,
                name: "Fastmail fixture",
              },
            ],
            state: "identity-1",
            notFound: [],
          };
          break;
        case "Email/set": {
          const updates = args.update as Record<
            string,
            Record<string, unknown>
          >;
          for (const [messageId, patch] of Object.entries(updates ?? {})) {
            const message = messages.find((entry) => entry.id === messageId);
            if (!message) continue;
            for (const [key, value] of Object.entries(patch)) {
              const [field, item] = key.split("/");
              if ((field === "mailboxIds" || field === "keywords") && item) {
                if (value === null) delete message[field][item];
                else message[field][item] = Boolean(value);
              }
            }
          }
          result = {
            updated: Object.fromEntries(
              Object.keys(updates ?? {}).map((key) => [key, null]),
            ),
            newState: "emails-1",
          };
          break;
        }
        default:
          return [
            "error",
            {
              type: "unknownMethod",
              description: `Unimplemented fixture method ${method}`,
            },
            id,
          ];
      }
      return [method, { accountId: accountId, ...result }, id];
    });
    reply({ sessionState: "session-1", methodResponses });
  });
  await new Promise<void>((resolve) =>
    server.listen(port, "127.0.0.1", resolve),
  );
  return {
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

function matches(
  message: {
    subject: string;
    mailboxIds: Record<string, boolean>;
    keywords: Record<string, boolean>;
    receivedAt: string;
  },
  filter: Record<string, unknown> | undefined,
): boolean {
  if (!filter) return true;
  if (filter.operator) {
    const values = (filter.conditions as Record<string, unknown>[]).map(
      (condition) => matches(message, condition),
    );
    if (filter.operator === "NOT") return !values.some(Boolean);
    return filter.operator === "OR"
      ? values.some(Boolean)
      : values.every(Boolean);
  }
  if (
    filter.text &&
    !message.subject.toLowerCase().includes(String(filter.text).toLowerCase())
  )
    return false;
  if (filter.inMailbox && !message.mailboxIds[String(filter.inMailbox)])
    return false;
  if (filter.notKeyword && message.keywords[String(filter.notKeyword)])
    return false;
  if (filter.hasKeyword && !message.keywords[String(filter.hasKeyword)])
    return false;
  if (filter.after && message.receivedAt <= String(filter.after)) return false;
  return true;
}
