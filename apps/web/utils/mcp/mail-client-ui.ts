import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { editorSchema } from "@/utils/mcp/mail-client-contract";
import { resolveMcpEmailAccount } from "@/utils/mcp/account-selection";
import {
  browseMailForMcp,
  browseMailSchema,
  readMailForMcp,
  readMailSchema,
  saveMailDraftForMcp,
  sendMailForMcp,
  sendMailSchema,
  changeMailForMcp,
  changeMailSchema,
} from "@/utils/mcp/mail-client";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import {
  getMailClientResourceUri,
  readMailClientHtml,
} from "@/utils/mcp/mail-client-bundle";

export function registerMailClient(
  server: McpServer,
  session: { userId: string; scopes: string[] },
  logger: Logger,
) {
  const resourceUri = getMailClientResourceUri();
  if (!resourceUri) return;

  server.registerResource(
    "mail-client",
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => {
      assertScope(session.scopes, "mcp:read");
      return {
        contents: [
          {
            uri: resourceUri,
            mimeType: RESOURCE_MIME_TYPE,
            text: await readMailClientHtml(),
            _meta: {
              ui: {
                prefersBorder: false,
                csp: { connectDomains: [], resourceDomains: [] },
              },
            },
          },
        ],
      };
    },
  );
  server.registerTool(
    "open_mail",
    {
      title: "Open Inbox Zero",
      description:
        "Open the mail client to browse, read, compose, and organize linked mailboxes. Link an Inbox Zero account first. Does not change mail.",
      inputSchema: {
        emailAccountId: z
          .string()
          .optional()
          .describe(
            "Linked mailbox ID from list_email_accounts; defaults to the first linked mailbox.",
          ),
        threadId: z
          .string()
          .optional()
          .describe(
            "Thread ID in the selected mailbox to open; omit to browse the inbox.",
          ),
      },
      annotations: {
        title: "Open Inbox Zero",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        ui: { resourceUri },
        "openai/ui": { entrypoints: [{ type: "global" }, { type: "thread" }] },
      },
    },
    async (args) => {
      assertScope(session.scopes, "mcp:read");
      if (args.emailAccountId)
        await resolveMcpEmailAccount({
          userId: session.userId,
          emailAccountId: args.emailAccountId,
        });
      return result(args, session.scopes);
    },
  );

  register({
    name: "browse_mail",
    title: "Browse mailbox",
    description:
      "List paginated mailbox threads and sidebar navigation. Browse a system view or a provider label/folder ID returned in navigation. Search uses the mailbox provider's syntax. Account ID comes from list_email_accounts.",
    schema: browseMailSchema,
    scope: "mcp:read",
    handler: browseMailForMcp,
    appOnly: true,
    destructiveHint: false,
    resource: false,
  });
  register({
    name: "read_mail",
    title: "Read mail in client",
    description:
      "Read a complete thread for the mail interface, including mailbox draft references. Use browse_mail to obtain its thread ID.",
    schema: readMailSchema,
    scope: "mcp:read",
    handler: readMailForMcp,
    appOnly: true,
    destructiveHint: false,
    resource: false,
  });
  register({
    name: "save_mail_draft",
    title: "Save mail draft",
    description:
      "Create or update a mailbox draft for review; never sends. Body is plain text. Use replyToMessageId from read_thread to thread a reply. Use its returned draftId for subsequent edits. Requires account write permission.",
    schema: editorSchema,
    scope: "mcp:write",
    handler: saveMailDraftForMcp,
    appOnly: false,
    destructiveHint: false,
    resource: true,
  });
  register({
    name: "send_mail",
    title: "Send mail",
    description:
      "Send email using the connected application’s mcp:send capability. The mail client UI asks the user to confirm recipients and content before invoking this tool; callers must obtain that confirmation. Body is plain text. Reuse mutationId, queuedAt, and the exact payload on retries to avoid duplicate sends. An uncertain result must be reconciled in Sent before another send. Requires mcp:send permission.",
    schema: sendMailSchema,
    scope: "mcp:send",
    handler: sendMailForMcp,
    appOnly: true,
    destructiveHint: true,
    resource: false,
  });
  register({
    name: "change_mail",
    title: "Organize mail",
    description:
      "Archive, undo archive, or set read state on a thread in the selected mailbox. Requires account write permission. Archive is recoverable using unarchive.",
    schema: changeMailSchema,
    scope: "mcp:write",
    handler: changeMailForMcp,
    appOnly: true,
    destructiveHint: false,
    resource: false,
  });

  function register<T extends z.ZodObject>({
    name,
    title,
    description,
    schema,
    scope,
    handler,
    appOnly,
    destructiveHint,
    resource,
  }: {
    name: string;
    title: string;
    description: string;
    schema: T;
    scope: string;
    handler: (
      userId: string,
      args: z.infer<T>,
      logger: Logger,
    ) => Promise<Record<string, unknown>>;
    appOnly: boolean;
    destructiveHint: boolean;
    resource: boolean;
  }) {
    server.registerTool(
      name,
      {
        title,
        description,
        inputSchema: schema.shape,
        annotations: {
          title,
          readOnlyHint: scope === "mcp:read",
          destructiveHint,
          openWorldHint: true,
        },
        _meta: {
          ui: {
            visibility: appOnly ? ["app"] : ["app", "model"],
            ...(resource && { resourceUri }),
          },
        },
      },
      async (args) => {
        try {
          assertScope(session.scopes, scope);
          return result(
            await handler(session.userId, schema.parse(args), logger),
            session.scopes,
          );
        } catch (error) {
          logger.warn("MCP tool failed", {
            tool: name,
            error: error instanceof Error ? error.message : error,
          });
          throw error;
        }
      },
    );
  }
}

function result(data: Record<string, unknown>, scopes: string[]) {
  const payload = {
    ...data,
    permissions: getMailPermissions(scopes),
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

function assertScope(scopes: string[], required: string) {
  if (!scopes.includes(required))
    throw new Error(`Missing required permission: ${required}`);
}

export function getMailPermissions(scopes: string[]) {
  return {
    read: scopes.includes("mcp:read"),
    write: scopes.includes("mcp:write"),
    send: scopes.includes("mcp:send"),
    settingsUrl: `${env.NEXT_PUBLIC_BASE_URL}/settings`,
  };
}
