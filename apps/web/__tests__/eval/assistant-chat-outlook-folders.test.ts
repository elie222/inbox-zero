import { afterAll, describe, expect, test } from "vitest";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { getMockMessage } from "@/__tests__/helpers";
import { FOLDER_SEPARATOR } from "@/utils/outlook/folders";
import {
  cloneEmailAccountForProvider,
  getLastMatchingToolCall,
  hasSearchBeforeTool,
  mockMoveThreadToFolder,
  mockSearchMessages,
  runAssistantChat,
  setupInboxWorkflowEval,
  TIMEOUT,
} from "@/__tests__/eval/assistant-chat-inbox-workflows-test-utils";

// pnpm --filter inbox-zero-ai test-ai __tests__/eval/assistant-chat-outlook-folders.test.ts
// Multi-model: EVAL_MODELS=all pnpm --filter inbox-zero-ai test-ai __tests__/eval/assistant-chat-outlook-folders.test.ts

const shouldRunEval = shouldRunEvalTests();
const evalReporter = createEvalReporter();

describe.runIf(shouldRunEval)("Eval: assistant chat Outlook folders", () => {
  setupInboxWorkflowEval();

  describeEvalMatrix(
    "assistant-chat outlook folders",
    (model, emailAccount) => {
      test(
        "moves searched messages to an Outlook folder",
        async () => {
          mockSearchMessages.mockResolvedValueOnce({
            messages: [
              getMockMessage({
                id: "msg-folder-move-1",
                threadId: "thread-folder-move-1",
                from: "updates@vendor.example",
                subject: "Release update",
                snippet: "A release note for review.",
                labelIds: ["INBOX"],
              }),
              getMockMessage({
                id: "msg-folder-move-2",
                threadId: "thread-folder-move-2",
                from: "updates@vendor.example",
                subject: "Maintenance update",
                snippet: "A maintenance notice for review.",
                labelIds: ["INBOX"],
              }),
            ],
            nextPageToken: undefined,
          });

          const { toolCalls, actual } = await runAssistantChat({
            emailAccount: cloneEmailAccountForProvider(
              emailAccount,
              "microsoft",
            ),
            messages: [
              {
                role: "user",
                content: `Move the two vendor update emails to my Operations${FOLDER_SEPARATOR}Reports Outlook folder.`,
              },
            ],
          });

          const moveCall = getLastMatchingToolCall(
            toolCalls,
            "moveThreadsToFolder",
            isMoveThreadsToFolderInput,
          )?.input;
          const movedThreadIds = new Set(moveCall?.threadIds ?? []);
          const movedToNestedFolder = mockMoveThreadToFolder.mock.calls.every(
            ([, , folderId]) => folderId === "folder-operations-reports",
          );
          const pass =
            !!moveCall &&
            hasSearchBeforeTool(toolCalls, "moveThreadsToFolder") &&
            movedThreadIds.has("thread-folder-move-1") &&
            movedThreadIds.has("thread-folder-move-2") &&
            normalizeFolderName(moveCall.folderName).includes("reports") &&
            mockMoveThreadToFolder.mock.calls.length === 2 &&
            movedToNestedFolder &&
            !toolCalls.some((toolCall) => toolCall.toolName === "manageInbox");

          evalReporter.record({
            testName: "outlook folder move uses folder tool after search",
            model: model.label,
            pass,
            actual: `${actual} | folderName=${moveCall?.folderName ?? "none"} | moved=${Array.from(
              movedThreadIds,
            ).join(",")}`,
          });

          expect(
            pass,
            `${actual} | folderName=${moveCall?.folderName ?? "none"} | moved=${Array.from(
              movedThreadIds,
            ).join(",")}`,
          ).toBe(true);
        },
        TIMEOUT,
      );

      test(
        "creates or reuses an Outlook folder when explicitly asked",
        async () => {
          const { toolCalls, actual } = await runAssistantChat({
            emailAccount: cloneEmailAccountForProvider(
              emailAccount,
              "microsoft",
            ),
            messages: [
              {
                role: "user",
                content:
                  "Make sure I have an Outlook folder called Vendor Updates.",
              },
            ],
          });

          const folderCall = getLastMatchingToolCall(
            toolCalls,
            "createOrGetFolder",
            isCreateOrGetFolderInput,
          )?.input;
          const pass =
            normalizeFolderName(folderCall?.name) === "vendor updates" &&
            !toolCalls.some(
              (toolCall) => toolCall.toolName === "createOrGetCategory",
            );

          evalReporter.record({
            testName: "outlook explicit folder create uses folder tool",
            model: model.label,
            pass,
            actual: `${actual} | folderName=${folderCall?.name ?? "none"}`,
          });

          expect(
            pass,
            `${actual} | folderName=${folderCall?.name ?? "none"}`,
          ).toBe(true);
        },
        TIMEOUT,
      );

      test(
        "lists Outlook folders without exposing internal folder ids",
        async () => {
          const { toolCalls, actual } = await runAssistantChat({
            emailAccount: cloneEmailAccountForProvider(
              emailAccount,
              "microsoft",
            ),
            messages: [
              {
                role: "user",
                content: "Show me my Outlook folders.",
              },
            ],
          });

          const listCall = toolCalls.find(
            (toolCall) => toolCall.toolName === "listFolders",
          );
          const outputText = JSON.stringify(listCall?.output ?? {});
          const pass =
            !!listCall &&
            outputText.includes(`Operations${FOLDER_SEPARATOR}Reports`) &&
            !outputText.includes("folder-operations") &&
            !outputText.includes("folder-vendor-updates") &&
            !toolCalls.some(
              (toolCall) =>
                toolCall.toolName === "listCategories" ||
                toolCall.toolName === "createOrGetCategory",
            );

          evalReporter.record({
            testName: "outlook folder listing hides internal ids",
            model: model.label,
            pass,
            actual: `${actual} | output=${outputText}`,
          });

          expect(pass, `${actual} | output=${outputText}`).toBe(true);
        },
        TIMEOUT,
      );
    },
  );

  afterAll(() => {
    evalReporter.printReport();
  });
});

function isMoveThreadsToFolderInput(
  input: unknown,
): input is { threadIds: string[]; folderName: string } {
  if (!input || typeof input !== "object") return false;

  const value = input as {
    threadIds?: unknown;
    folderName?: unknown;
  };

  return Array.isArray(value.threadIds) && typeof value.folderName === "string";
}

function isCreateOrGetFolderInput(input: unknown): input is { name: string } {
  return (
    !!input &&
    typeof input === "object" &&
    typeof (input as { name?: unknown }).name === "string"
  );
}

function normalizeFolderName(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
