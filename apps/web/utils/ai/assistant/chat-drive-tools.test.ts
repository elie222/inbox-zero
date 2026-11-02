import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import {
	createOrGetFilingFolderTool,
	getDriveFilingConfigurationTool,
	removeFilingFolderTool,
	updateDriveFilingRulesTool,
} from "./chat-drive-tools";

vi.mock("@/utils/prisma");
vi.mock("@/utils/posthog", () => ({
	posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/utils/drive/provider", () => ({
	createDriveProviderWithRefresh: vi.fn(),
}));
vi.mock("@/utils/drive/folder-utils", () => ({
	createAndSaveFilingFolder: vi.fn(),
}));

import { createAndSaveFilingFolder } from "@/utils/drive/folder-utils";
import { createDriveProviderWithRefresh } from "@/utils/drive/provider";

const logger = createTestLogger();
const TEST_EMAIL = "user@test.com";
const toolOptions = {
	email: TEST_EMAIL,
	emailAccountId: "email-account-1",
	logger,
};

type GenericToolExecutor = {
	execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

describe("chat drive tools", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("getDriveFilingConfigurationTool", () => {
		it("returns guidance when no cloud drive is connected", async () => {
			prisma.driveConnection.findMany.mockResolvedValue([]);
			prisma.emailAccount.findUnique.mockResolvedValue({
				filingEnabled: false,
				filingPrompt: null,
				filingConfirmationSendEmail: true,
			} as unknown as Awaited<
				ReturnType<typeof prisma.emailAccount.findUnique>
			>);

			const toolInstance = getDriveFilingConfigurationTool(toolOptions);
			const executor = toolInstance as unknown as GenericToolExecutor;
			const result = await executor.execute({});

			expect(result).toMatchObject({
				hasConnectedDrive: false,
				connections: [],
				filingEnabled: false,
				filingPrompt: null,
				filingConfirmationSendEmail: true,
				filingFolders: [],
				recentFilings: [],
			});
			expect(result.message).toContain("No cloud drive connected");
		});

		it("returns full configuration and configured folders when drives are connected", async () => {
			const now = new Date();
			prisma.driveConnection.findMany.mockResolvedValue([
				{
					id: "conn-1",
					provider: "google",
					email: "drive-user@gmail.com",
					isConnected: true,
					filingFolders: [
						{
							id: "ff-1",
							folderId: "google-folder-123",
							folderName: "Invoices",
							folderPath: "Finance/Invoices",
							createdAt: now,
						},
					],
				},
				{
					id: "conn-2",
					provider: "onedrive",
					email: "disconnected@outlook.com",
					isConnected: false,
					filingFolders: [
						{
							id: "ff-2",
							folderId: "onedrive-folder-456",
							folderName: "Old Invoices",
							folderPath: "Old/Invoices",
							createdAt: now,
						},
					],
				},
			] as unknown as Awaited<
				ReturnType<typeof prisma.driveConnection.findMany>
			>);
			prisma.emailAccount.findUnique.mockResolvedValue({
				filingEnabled: true,
				filingPrompt: "Put invoices in Finance/Invoices",
				filingConfirmationSendEmail: true,
			} as unknown as Awaited<
				ReturnType<typeof prisma.emailAccount.findUnique>
			>);
			prisma.documentFiling.findMany.mockResolvedValue([
				{
					id: "filing-1",
					filename: "receipt-2026.pdf",
					folderPath: "Finance/Invoices",
					status: "filed",
					createdAt: now,
				},
			] as unknown as Awaited<
				ReturnType<typeof prisma.documentFiling.findMany>
			>);

			const toolInstance = getDriveFilingConfigurationTool(toolOptions);
			const executor = toolInstance as unknown as GenericToolExecutor;
			const result = await executor.execute({
				includeRecentFilings: true,
			});

			expect(result).toEqual({
				hasConnectedDrive: true,
				connections: [
					{
						id: "conn-1",
						provider: "google",
						email: "drive-user@gmail.com",
						isConnected: true,
					},
					{
						id: "conn-2",
						provider: "onedrive",
						email: "disconnected@outlook.com",
						isConnected: false,
					},
				],
				filingEnabled: true,
				filingPrompt: "Put invoices in Finance/Invoices",
				filingConfirmationSendEmail: true,
				filingFolders: [
					{
						id: "ff-1",
						folderId: "google-folder-123",
						folderName: "Invoices",
						folderPath: "Finance/Invoices",
						driveConnectionId: "conn-1",
						provider: "google",
						driveEmail: "drive-user@gmail.com",
					},
				],
				recentFilings: [
					{
						id: "filing-1",
						filename: "receipt-2026.pdf",
						folderPath: "Finance/Invoices",
						status: "filed",
						filedAt: now.toISOString(),
					},
				],
			});
		});

		it("handles unexpected database error gracefully", async () => {
			prisma.driveConnection.findMany.mockRejectedValue(new Error("DB error"));

			const toolInstance = getDriveFilingConfigurationTool(toolOptions);
			const executor = toolInstance as unknown as GenericToolExecutor;
			const result = await executor.execute({});

			expect(result).toEqual({
				error: "Failed to get drive filing configuration",
			});
		});
	});

	describe("updateDriveFilingRulesTool", () => {
		it("returns error if email account not found", async () => {
			prisma.emailAccount.findUnique.mockResolvedValue(null);

			const toolInstance = updateDriveFilingRulesTool(toolOptions);
			const executor = toolInstance as unknown as GenericToolExecutor;
			const result = await executor.execute({
				filingPrompt: "New prompt",
			});

			expect(result).toEqual({ error: "Email account not found" });
		});

		it("replaces filing prompt and updates enabled state", async () => {
			prisma.emailAccount.findUnique.mockResolvedValue({
				filingPrompt: "Old prompt",
				filingEnabled: false,
				filingConfirmationSendEmail: true,
			} as unknown as Awaited<
				ReturnType<typeof prisma.emailAccount.findUnique>
			>);
			prisma.emailAccount.update.mockResolvedValue({
				filingPrompt: "File contracts in Legal",
				filingEnabled: true,
				filingConfirmationSendEmail: false,
			} as unknown as Awaited<ReturnType<typeof prisma.emailAccount.update>>);

			const toolInstance = updateDriveFilingRulesTool(toolOptions);
			const executor = toolInstance as unknown as GenericToolExecutor;
			const result = await executor.execute({
				filingPrompt: "File contracts in Legal",
				mode: "replace",
				filingEnabled: true,
				filingConfirmationSendEmail: false,
			});

			expect(prisma.emailAccount.update).toHaveBeenCalledWith({
				where: { id: "email-account-1" },
				data: {
					filingPrompt: "File contracts in Legal",
					filingEnabled: true,
					filingConfirmationSendEmail: false,
				},
				select: {
					filingPrompt: true,
					filingEnabled: true,
					filingConfirmationSendEmail: true,
				},
			});
			expect(result).toEqual({
				success: true,
				filingPrompt: "File contracts in Legal",
				filingEnabled: true,
				filingConfirmationSendEmail: false,
			});
		});

		it("appends to existing filing prompt when mode is append", async () => {
			prisma.emailAccount.findUnique.mockResolvedValue({
				filingPrompt: "Put invoices in Finance/Invoices",
				filingEnabled: true,
				filingConfirmationSendEmail: true,
			} as unknown as Awaited<
				ReturnType<typeof prisma.emailAccount.findUnique>
			>);
			prisma.emailAccount.update.mockResolvedValue({
				filingPrompt:
					"Put invoices in Finance/Invoices\nPut receipts in Expenses",
				filingEnabled: true,
				filingConfirmationSendEmail: true,
			} as unknown as Awaited<ReturnType<typeof prisma.emailAccount.update>>);

			const toolInstance = updateDriveFilingRulesTool(toolOptions);
			const executor = toolInstance as unknown as GenericToolExecutor;
			const result = await executor.execute({
				filingPrompt: "Put receipts in Expenses",
				mode: "append",
			});

			expect(prisma.emailAccount.update).toHaveBeenCalledWith({
				where: { id: "email-account-1" },
				data: {
					filingPrompt:
						"Put invoices in Finance/Invoices\nPut receipts in Expenses",
				},
				select: {
					filingPrompt: true,
					filingEnabled: true,
					filingConfirmationSendEmail: true,
				},
			});
			expect(result.success).toBe(true);
		});

		it("returns error when enabling filing without filing prompt", async () => {
			prisma.emailAccount.findUnique.mockResolvedValue({
				filingPrompt: null,
				filingEnabled: false,
				filingConfirmationSendEmail: true,
			} as unknown as Awaited<
				ReturnType<typeof prisma.emailAccount.findUnique>
			>);

			const toolInstance = updateDriveFilingRulesTool(toolOptions);
			const executor = toolInstance as unknown as GenericToolExecutor;
			const result = await executor.execute({
				filingEnabled: true,
			});

			expect(result).toEqual({
				error:
					"Cannot enable automatic filing without filing instructions. Please provide a filing prompt (e.g. 'File invoices in Finance/Invoices and receipts in Expenses').",
			});
			expect(prisma.emailAccount.update).not.toHaveBeenCalled();
		});

		it("clears filing prompt when passed whitespace-only string", async () => {
			prisma.emailAccount.findUnique.mockResolvedValue({
				filingPrompt: "Existing prompt",
				filingEnabled: false,
				filingConfirmationSendEmail: true,
			} as unknown as Awaited<
				ReturnType<typeof prisma.emailAccount.findUnique>
			>);
			prisma.emailAccount.update.mockResolvedValue({
				filingPrompt: null,
				filingEnabled: false,
				filingConfirmationSendEmail: true,
			} as unknown as Awaited<ReturnType<typeof prisma.emailAccount.update>>);

			const toolInstance = updateDriveFilingRulesTool(toolOptions);
			const executor = toolInstance as unknown as GenericToolExecutor;
			const result = await executor.execute({
				filingPrompt: "   ",
			});

			expect(prisma.emailAccount.update).toHaveBeenCalledWith({
				where: { id: "email-account-1" },
				data: {
					filingPrompt: null,
				},
				select: {
					filingPrompt: true,
					filingEnabled: true,
					filingConfirmationSendEmail: true,
				},
			});
			expect(result.filingPrompt).toBeNull();
		});

		it("clears filing prompt when passed null", async () => {
			prisma.emailAccount.findUnique.mockResolvedValue({
				filingPrompt: "Existing prompt",
				filingEnabled: false,
				filingConfirmationSendEmail: true,
			} as unknown as Awaited<
				ReturnType<typeof prisma.emailAccount.findUnique>
			>);
			prisma.emailAccount.update.mockResolvedValue({
				filingPrompt: null,
				filingEnabled: false,
				filingConfirmationSendEmail: true,
			} as unknown as Awaited<ReturnType<typeof prisma.emailAccount.update>>);

			const toolInstance = updateDriveFilingRulesTool(toolOptions);
			const executor = toolInstance as unknown as GenericToolExecutor;
			const result = await executor.execute({
				filingPrompt: null,
			});

			expect(prisma.emailAccount.update).toHaveBeenCalledWith({
				where: { id: "email-account-1" },
				data: {
					filingPrompt: null,
				},
				select: {
					filingPrompt: true,
					filingEnabled: true,
					filingConfirmationSendEmail: true,
				},
			});
			expect(result.filingPrompt).toBeNull();
		});
	});

	describe("createOrGetFilingFolderTool", () => {
		it("returns error when no active drive is connected", async () => {
			prisma.driveConnection.findFirst.mockResolvedValue(null);

			const toolInstance = createOrGetFilingFolderTool(toolOptions);
			const executor = toolInstance as unknown as GenericToolExecutor;
			const result = await executor.execute({
				folderPath: "Finance/Invoices",
			});

			expect(result).toEqual({
				error:
					"No connected cloud drive found. Connect Google Drive or Microsoft OneDrive first.",
			});
		});

		it("creates/registers folder in drive and saves as filing folder", async () => {
			const mockDrive = {
				id: "drive-conn-1",
				provider: "google",
				email: "user@gmail.com",
				isConnected: true,
			};
			prisma.driveConnection.findFirst.mockResolvedValue(
				mockDrive as unknown as Awaited<
					ReturnType<typeof prisma.driveConnection.findFirst>
				>,
			);

			const mockProvider = { name: "google" };
			vi.mocked(createDriveProviderWithRefresh).mockResolvedValue(
				mockProvider as unknown as Awaited<
					ReturnType<typeof createDriveProviderWithRefresh>
				>,
			);

			vi.mocked(createAndSaveFilingFolder).mockResolvedValue({
				id: "drive-folder-456",
				name: "Invoices",
				path: "Finance/Invoices",
			});

			const toolInstance = createOrGetFilingFolderTool(toolOptions);
			const executor = toolInstance as unknown as GenericToolExecutor;
			const result = await executor.execute({
				folderPath: "Finance/Invoices",
			});

			expect(createDriveProviderWithRefresh).toHaveBeenCalledWith(
				mockDrive,
				logger,
			);
			expect(createAndSaveFilingFolder).toHaveBeenCalledWith({
				driveProvider: mockProvider,
				folderPath: "Finance/Invoices",
				emailAccountId: "email-account-1",
				driveConnectionId: "drive-conn-1",
				logger,
			});
			expect(result).toEqual({
				success: true,
				folder: {
					id: "drive-folder-456",
					name: "Invoices",
					path: "Finance/Invoices",
					provider: "google",
					driveEmail: "user@gmail.com",
				},
			});
		});
	});

	describe("removeFilingFolderTool", () => {
		it("removes filing folder by folderId", async () => {
			prisma.filingFolder.deleteMany.mockResolvedValue({ count: 1 });

			const toolInstance = removeFilingFolderTool(toolOptions);
			const executor = toolInstance as unknown as GenericToolExecutor;
			const result = await executor.execute({
				folderId: "folder-to-remove",
			});

			expect(prisma.filingFolder.deleteMany).toHaveBeenCalledWith({
				where: {
					emailAccountId: "email-account-1",
					folderId: "folder-to-remove",
				},
			});
			expect(result).toMatchObject({
				success: true,
				removedCount: 1,
			});
			expect(result.warning).toContain("removed from allowed destinations");
		});

		it("returns error when folder was not in filing folders", async () => {
			prisma.filingFolder.deleteMany.mockResolvedValue({ count: 0 });

			const toolInstance = removeFilingFolderTool(toolOptions);
			const executor = toolInstance as unknown as GenericToolExecutor;
			const result = await executor.execute({
				folderId: "nonexistent-folder",
			});

			expect(result).toEqual({
				error: "Folder was not found in filing folders for this account.",
			});
		});
	});
});
