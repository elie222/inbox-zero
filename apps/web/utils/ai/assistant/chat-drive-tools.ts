import { type InferUITool, tool } from "ai";
import { z } from "zod";
import { createAndSaveFilingFolder } from "@/utils/drive/folder-utils";
import { createDriveProviderWithRefresh } from "@/utils/drive/provider";
import type { Logger } from "@/utils/logger";
import { posthogCaptureEvent } from "@/utils/posthog";
import prisma from "@/utils/prisma";

type DriveToolOptions = {
	email: string;
	emailAccountId: string;
	logger: Logger;
};

const getDriveFilingConfigurationInputSchema = z.object({
	includeRecentFilings: z
		.boolean()
		.optional()
		.describe(
			"Whether to include the most recent filed attachments (defaults to true).",
		),
});

export const getDriveFilingConfigurationTool = ({
	email,
	emailAccountId,
	logger,
}: DriveToolOptions) =>
	tool({
		description:
			"Inspect the connected cloud drive (Google Drive, Microsoft OneDrive) and attachment filing configuration, including active connection status, whether automatic filing is enabled, the custom filing instructions/prompt, configured destination folders, and recent filed documents.",
		inputSchema: getDriveFilingConfigurationInputSchema,
		execute: async ({ includeRecentFilings }) => {
			trackToolCall({ tool: "get_drive_filing_configuration", email, logger });

			try {
				const [connections, emailAccount, recentFilings] = await Promise.all([
					prisma.driveConnection.findMany({
						where: { emailAccountId },
						include: {
							filingFolders: {
								select: {
									id: true,
									folderId: true,
									folderName: true,
									folderPath: true,
									createdAt: true,
								},
							},
						},
					}),
					prisma.emailAccount.findUnique({
						where: { id: emailAccountId },
						select: {
							filingEnabled: true,
							filingPrompt: true,
							filingConfirmationSendEmail: true,
						},
					}),
					includeRecentFilings !== false
						? prisma.documentFiling.findMany({
								where: { emailAccountId },
								orderBy: { createdAt: "desc" },
								take: 5,
								select: {
									id: true,
									filename: true,
									folderPath: true,
									status: true,
									createdAt: true,
								},
							})
						: Promise.resolve([]),
				]);

				if (connections.length === 0) {
					return {
						hasConnectedDrive: false,
						connections: [],
						filingEnabled: emailAccount?.filingEnabled ?? false,
						filingPrompt: emailAccount?.filingPrompt ?? null,
						filingConfirmationSendEmail:
							emailAccount?.filingConfirmationSendEmail ?? true,
						filingFolders: [],
						recentFilings: [],
						message:
							"No cloud drive connected. Connect Google Drive or Microsoft OneDrive in Drive settings before attachments can be automatically filed.",
					};
				}

				const activeConnections = connections.filter((c) => c.isConnected);
				const filingFolders = connections.flatMap((c) =>
					c.filingFolders.map((f) => ({
						id: f.id,
						folderId: f.folderId,
						folderName: f.folderName,
						folderPath: f.folderPath,
						driveConnectionId: c.id,
						provider: c.provider,
						driveEmail: c.email,
					})),
				);

				return {
					hasConnectedDrive: activeConnections.length > 0,
					connections: connections.map((c) => ({
						id: c.id,
						provider: c.provider,
						email: c.email,
						isConnected: c.isConnected,
					})),
					filingEnabled: emailAccount?.filingEnabled ?? false,
					filingPrompt: emailAccount?.filingPrompt ?? null,
					filingConfirmationSendEmail:
						emailAccount?.filingConfirmationSendEmail ?? true,
					filingFolders,
					recentFilings: recentFilings.map((rf) => ({
						id: rf.id,
						filename: rf.filename,
						folderPath: rf.folderPath,
						status: rf.status,
						filedAt: rf.createdAt.toISOString(),
					})),
				};
			} catch (error) {
				logger.error("Failed to get drive filing configuration", { error });
				return { error: "Failed to get drive filing configuration" };
			}
		},
	});

const updateDriveFilingRulesInputSchema = z.object({
	filingPrompt: z
		.string()
		.nullable()
		.optional()
		.describe(
			"Instructions defining how attachments should be categorized and filed into folders (e.g. 'Put invoices in Finance/Invoices, contracts in Legal'). Pass null or empty string to clear.",
		),
	mode: z
		.enum(["replace", "append"])
		.optional()
		.describe(
			"Whether to replace the prompt or append to the existing filing prompt. Defaults to 'replace'.",
		),
	filingEnabled: z
		.boolean()
		.optional()
		.describe("Whether automatic attachment filing to Drive is enabled."),
	filingConfirmationSendEmail: z
		.boolean()
		.optional()
		.describe(
			"Whether to send an email confirmation when attachments are filed.",
		),
});

export const updateDriveFilingRulesTool = ({
	email,
	emailAccountId,
	logger,
}: DriveToolOptions) =>
	tool({
		description:
			"Update automatic attachment filing rules and configuration for Drive. Use this to update the filing instructions/prompt (e.g. 'put invoices in Finance/Invoices'), enable/disable automatic filing, or toggle filing email confirmations.",
		inputSchema: updateDriveFilingRulesInputSchema,
		execute: async ({
			filingPrompt,
			mode = "replace",
			filingEnabled,
			filingConfirmationSendEmail,
		}) => {
			trackToolCall({ tool: "update_drive_filing_rules", email, logger });

			try {
				const current = await prisma.emailAccount.findUnique({
					where: { id: emailAccountId },
					select: {
						filingPrompt: true,
						filingEnabled: true,
						filingConfirmationSendEmail: true,
					},
				});

				if (!current) {
					return { error: "Email account not found" };
				}

				let resolvedPrompt: string | null | undefined;
				if (filingPrompt !== undefined) {
					if (filingPrompt === null || filingPrompt.trim() === "") {
						resolvedPrompt = null;
					} else if (mode === "append" && current.filingPrompt) {
						resolvedPrompt = `${current.filingPrompt}\n${filingPrompt.trim()}`;
					} else {
						resolvedPrompt = filingPrompt.trim();
					}
				}

				const updatedAccount = await prisma.emailAccount.update({
					where: { id: emailAccountId },
					data: {
						...(resolvedPrompt !== undefined
							? { filingPrompt: resolvedPrompt }
							: {}),
						...(filingEnabled !== undefined ? { filingEnabled } : {}),
						...(filingConfirmationSendEmail !== undefined
							? { filingConfirmationSendEmail }
							: {}),
					},
					select: {
						filingPrompt: true,
						filingEnabled: true,
						filingConfirmationSendEmail: true,
					},
				});

				return {
					success: true,
					filingEnabled: updatedAccount.filingEnabled,
					filingPrompt: updatedAccount.filingPrompt,
					filingConfirmationSendEmail:
						updatedAccount.filingConfirmationSendEmail,
				};
			} catch (error) {
				logger.error("Failed to update drive filing rules", { error });
				return { error: "Failed to update drive filing rules" };
			}
		},
	});

const createOrGetFilingFolderInputSchema = z.object({
	folderPath: z
		.string()
		.trim()
		.min(1)
		.max(500)
		.describe(
			"The folder name or nested path in Drive to create/register for filing (e.g. 'Invoices', 'Finance/Invoices', or 'Contracts/2026').",
		),
	driveConnectionId: z
		.string()
		.optional()
		.describe(
			"Optional specific DriveConnection ID. If omitted, uses the first active connected drive.",
		),
});

export const createOrGetFilingFolderTool = ({
	email,
	emailAccountId,
	logger,
}: DriveToolOptions) =>
	tool({
		description:
			"Create or register a folder path in the user's connected cloud Drive (e.g. 'Finance/Invoices' or 'Receipts') and add it as an allowed destination folder for automatic attachment filing.",
		inputSchema: createOrGetFilingFolderInputSchema,
		execute: async ({ folderPath, driveConnectionId }) => {
			trackToolCall({ tool: "create_or_get_filing_folder", email, logger });

			try {
				const connection = await prisma.driveConnection.findFirst({
					where: {
						emailAccountId,
						isConnected: true,
						...(driveConnectionId ? { id: driveConnectionId } : {}),
					},
				});

				if (!connection) {
					return {
						error:
							"No connected cloud drive found. Connect Google Drive or Microsoft OneDrive first.",
					};
				}

				const driveProvider = await createDriveProviderWithRefresh(
					connection,
					logger,
				);

				const folder = await createAndSaveFilingFolder({
					driveProvider,
					folderPath,
					emailAccountId,
					driveConnectionId: connection.id,
					logger,
				});

				return {
					success: true,
					folder: {
						id: folder.id,
						name: folder.name,
						path: folder.path ?? folderPath,
						provider: connection.provider,
						driveEmail: connection.email,
					},
				};
			} catch (error) {
				logger.error("Failed to create or get filing folder", { error });
				return { error: "Failed to create or get filing folder" };
			}
		},
	});

const removeFilingFolderInputSchema = z.object({
	folderId: z
		.string()
		.trim()
		.min(1)
		.describe(
			"The Drive folder ID (from getDriveFilingConfiguration filingFolders) to remove from filing destinations.",
		),
});

export const removeFilingFolderTool = ({
	email,
	emailAccountId,
	logger,
}: DriveToolOptions) =>
	tool({
		description:
			"Remove a folder from the allowed attachment filing destinations. The folder and its contents in cloud Drive are preserved.",
		inputSchema: removeFilingFolderInputSchema,
		execute: async ({ folderId }) => {
			trackToolCall({ tool: "remove_filing_folder", email, logger });

			try {
				const result = await prisma.filingFolder.deleteMany({
					where: {
						emailAccountId,
						folderId,
					},
				});

				if (result.count === 0) {
					return {
						error: "Folder was not found in filing folders for this account.",
					};
				}

				return {
					success: true,
					removedCount: result.count,
				};
			} catch (error) {
				logger.error("Failed to remove filing folder", { error });
				return { error: "Failed to remove filing folder" };
			}
		},
	});

export type GetDriveFilingConfigurationTool = InferUITool<
	ReturnType<typeof getDriveFilingConfigurationTool>
>;
export type UpdateDriveFilingRulesTool = InferUITool<
	ReturnType<typeof updateDriveFilingRulesTool>
>;
export type CreateOrGetFilingFolderTool = InferUITool<
	ReturnType<typeof createOrGetFilingFolderTool>
>;
export type RemoveFilingFolderTool = InferUITool<
	ReturnType<typeof removeFilingFolderTool>
>;

async function trackToolCall({
	tool: toolName,
	email,
	logger,
}: {
	tool: string;
	email: string;
	logger: Logger;
}) {
	logger.trace("Tracking tool call", { tool: toolName, email });
	return posthogCaptureEvent(email, "AI Assistant Chat Tool Call", {
		tool: toolName,
	});
}
