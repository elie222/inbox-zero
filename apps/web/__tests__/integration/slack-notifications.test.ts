/**
 * Integration test: Slack notification flows via @inbox-zero/emulate
 *
 * Tests real app notification flows — message formatting, Block Kit
 * construction, and delivery — against a local Slack emulator.
 *
 * Usage:
 *   pnpm test-integration slack-notifications
 */

import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { createEmulator, type Emulator } from "emulate";
import { WebClient } from "@slack/web-api";

vi.mock("server-only", () => ({}));

// Mock createSlackClient so production functions use our emulator-bound client
let emulatorClient: WebClient;
vi.mock("@/utils/messaging/providers/slack/client", () => ({
  createSlackClient: () => emulatorClient,
}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const TEST_PORT = 4098;

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Slack notification flows",
  { timeout: 30_000 },
  () => {
    let emulator: Emulator;
    let notifChannelId: string;
    let engChannelId: string;

    beforeAll(async () => {
      emulator = await createEmulator({
        service: "slack",
        port: TEST_PORT,
        seed: {
          slack: {
            team: { name: "TestWorkspace", domain: "test-workspace" },
            users: [
              {
                name: "alice",
                real_name: "Alice Smith",
                email: "alice@example.com",
              },
            ],
            channels: [
              {
                name: "inbox-zero-notifications",
                is_private: true,
                topic: "Inbox Zero alerts",
              },
              {
                name: "engineering",
                is_private: false,
                topic: "Engineering discussion",
              },
            ],
          },
        },
      });

      emulatorClient = new WebClient("emulator-token", {
        slackApiUrl: `${emulator.url}/api/`,
      });

      // Resolve channel IDs once for all tests
      const { listChannels } = await import(
        "@/utils/messaging/providers/slack/channels"
      );
      const channels = await listChannels(emulatorClient);
      notifChannelId = channels.find(
        (c) => c.name === "inbox-zero-notifications",
      )!.id;
      engChannelId = channels.find((c) => c.name === "engineering")!.id;
    });

    afterAll(async () => {
      await emulator?.close();
    });

    test("sendChannelConfirmation delivers onboarding message", async () => {
      const { sendChannelConfirmation } = await import(
        "@/utils/messaging/providers/slack/send"
      );

      await sendChannelConfirmation({
        accessToken: "emulator-token",
        channelId: notifChannelId,
      });

      const history = await emulatorClient.conversations.history({
        channel: notifChannelId,
      });
      const msg = history.messages!.find((m) =>
        m.text?.includes("Inbox Zero connected"),
      );
      expect(msg).toBeDefined();
    });

    test("sendMeetingBriefingToSlack delivers structured briefing with guest data", async () => {
      const { sendMeetingBriefingToSlack } = await import(
        "@/utils/messaging/providers/slack/send"
      );

      await sendMeetingBriefingToSlack({
        accessToken: "emulator-token",
        channelId: notifChannelId,
        meetingTitle: "Sprint Planning",
        formattedTime: "2:00 PM",
        videoConferenceLink: "https://meet.example.com/sprint",
        eventUrl: "https://calendar.example.com/event/123",
        briefingContent: {
          guests: [
            {
              name: "Jane Doe",
              email: "jane@partner.com",
              bullets: [
                "VP of Engineering at Partner Corp",
                "Previously discussed Q2 roadmap alignment",
              ],
            },
          ],
          internalTeamMembers: [
            { name: "Alice Smith", email: "alice@example.com" },
          ],
        },
      });

      const history = await emulatorClient.conversations.history({
        channel: notifChannelId,
      });
      const msg = history.messages!.find((m) =>
        m.text?.includes("Sprint Planning"),
      );
      expect(msg).toBeDefined();
      expect(msg!.text).toContain("2:00 PM");
    });

    test("sendDocumentFiledToSlack delivers filing confirmation with path", async () => {
      const { sendDocumentFiledToSlack } = await import(
        "@/utils/messaging/providers/slack/send"
      );

      await sendDocumentFiledToSlack({
        accessToken: "emulator-token",
        channelId: engChannelId,
        filename: "invoice-2026-03.pdf",
        folderPath: "Finance/Invoices/2026",
        driveProvider: "google",
      });

      const history = await emulatorClient.conversations.history({
        channel: engChannelId,
      });
      const msg = history.messages!.find((m) =>
        m.text?.includes("invoice-2026-03.pdf"),
      );
      expect(msg).toBeDefined();
      expect(msg!.text).toContain("Finance/Invoices/2026");
    });

    test("sendDocumentAskToSlack delivers ambiguous filing prompt", async () => {
      const { sendDocumentAskToSlack } = await import(
        "@/utils/messaging/providers/slack/send"
      );

      await sendDocumentAskToSlack({
        accessToken: "emulator-token",
        channelId: engChannelId,
        filename: "contract-draft-v2.docx",
        reasoning:
          "This looks like a legal contract but I'm not sure which folder it belongs in.",
      });

      const history = await emulatorClient.conversations.history({
        channel: engChannelId,
      });
      const msg = history.messages!.find((m) =>
        m.text?.includes("contract-draft-v2.docx"),
      );
      expect(msg).toBeDefined();
    });

    test("addReaction/removeReaction manages processing indicator", async () => {
      const { addReaction, removeReaction } = await import(
        "@/utils/messaging/providers/slack/reactions"
      );

      // Post a message to react to
      const posted = await emulatorClient.chat.postMessage({
        channel: engChannelId,
        text: "Processing this email...",
      });
      const ts = posted.ts!;

      // Add "eyes" reaction (processing indicator)
      await addReaction(emulatorClient, engChannelId, ts, "eyes");

      const reactions = await emulatorClient.reactions.get({
        channel: engChannelId,
        timestamp: ts,
      });
      const eyesReaction = reactions.message?.reactions?.find(
        (r) => r.name === "eyes",
      );
      expect(eyesReaction).toBeDefined();

      // Remove it (processing done)
      await removeReaction(emulatorClient, engChannelId, ts, "eyes");

      const after = await emulatorClient.reactions.get({
        channel: engChannelId,
        timestamp: ts,
      });
      const eyesAfter = after.message?.reactions?.find(
        (r) => r.name === "eyes",
      );
      expect(eyesAfter).toBeUndefined();
    });

    test("addReaction silently handles errors for missing messages", async () => {
      const { addReaction } = await import(
        "@/utils/messaging/providers/slack/reactions"
      );

      // Should not throw — addReaction swallows errors
      await expect(
        addReaction(emulatorClient, engChannelId, "9999999999.999999", "eyes"),
      ).resolves.toBeUndefined();
    });
  },
);
