/**
 * Integration test: Slack notifications via @inbox-zero/emulate
 *
 * Verifies that the Slack utility functions (send messages, list channels,
 * lookup users) work correctly against a local Slack emulator.
 *
 * Usage:
 *   pnpm test-integration slack-notifications
 */

import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { createEmulator, type Emulator } from "emulate";
import { WebClient } from "@slack/web-api";

vi.mock("server-only", () => ({}));

// Mock createSlackClient so the production functions use our emulator-bound client
let emulatorClient: WebClient;
vi.mock("@/utils/messaging/providers/slack/client", () => ({
  createSlackClient: () => emulatorClient,
}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const TEST_PORT = 4098;

const SEED_CHANNELS = [
  {
    name: "inbox-zero-notifications",
    is_private: true,
    topic: "Inbox Zero alerts",
  },
  { name: "engineering", is_private: false, topic: "Engineering discussion" },
];

const SEED_USERS = [
  {
    name: "alice",
    real_name: "Alice Smith",
    email: "alice@example.com",
    is_admin: false,
  },
  {
    name: "bob",
    real_name: "Bob Jones",
    email: "bob@example.com",
    is_admin: true,
  },
];

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Slack notifications",
  { timeout: 30_000 },
  () => {
    let emulator: Emulator;

    beforeAll(async () => {
      emulator = await createEmulator({
        service: "slack",
        port: TEST_PORT,
        seed: {
          slack: {
            team: { name: "TestWorkspace", domain: "test-workspace" },
            users: SEED_USERS,
            channels: SEED_CHANNELS,
          },
        },
      });

      // Create a WebClient pointing at the emulator.
      // The emulator accepts any bearer token — "emulator-token" works fine.
      emulatorClient = new WebClient("emulator-token", {
        slackApiUrl: `${emulator.url}/api/`,
      });
    });

    afterAll(async () => {
      await emulator?.close();
    });

    test("listChannels returns seeded channels (plus defaults)", async () => {
      const { listChannels } = await import(
        "@/utils/messaging/providers/slack/channels"
      );

      const channels = await listChannels(emulatorClient);

      // The emulator seeds "general" and "random" by default,
      // plus our two custom channels.
      expect(channels.length).toBeGreaterThanOrEqual(4);

      const names = channels.map((c) => c.name);
      expect(names).toContain("general");
      expect(names).toContain("random");
      expect(names).toContain("inbox-zero-notifications");
      expect(names).toContain("engineering");

      // Verify private flag propagated correctly
      const notifChannel = channels.find(
        (c) => c.name === "inbox-zero-notifications",
      );
      expect(notifChannel).toBeDefined();
      expect(notifChannel!.isPrivate).toBe(true);

      const engChannel = channels.find((c) => c.name === "engineering");
      expect(engChannel).toBeDefined();
      expect(engChannel!.isPrivate).toBe(false);

      // listChannels sorts by name
      const sortedNames = [...names].sort((a, b) => a.localeCompare(b));
      expect(names).toEqual(sortedNames);
    });

    test("getChannelInfo returns correct channel details", async () => {
      const { getChannelInfo, listChannels } = await import(
        "@/utils/messaging/providers/slack/channels"
      );

      // First get the channel ID via list
      const channels = await listChannels(emulatorClient);
      const general = channels.find((c) => c.name === "general");
      expect(general).toBeDefined();

      const info = await getChannelInfo(emulatorClient, general!.id);
      expect(info).not.toBeNull();
      expect(info!.name).toBe("general");
      expect(info!.isPrivate).toBe(false);
    });

    test("getChannelInfo throws for unknown channel", async () => {
      const { getChannelInfo } = await import(
        "@/utils/messaging/providers/slack/channels"
      );

      // The Slack API (and emulator) returns an error for unknown channels,
      // which the WebClient surfaces as a thrown Error. getChannelInfo does
      // not catch this — callers are expected to handle it.
      await expect(
        getChannelInfo(emulatorClient, "C999999999"),
      ).rejects.toThrow("channel_not_found");
    });

    test("lookupSlackUserByEmail finds seeded user", async () => {
      const { lookupSlackUserByEmail } = await import(
        "@/utils/messaging/providers/slack/users"
      );

      const alice = await lookupSlackUserByEmail(
        emulatorClient,
        "alice@example.com",
      );
      expect(alice).not.toBeNull();
      expect(alice!.name).toBe("alice");
      expect(alice!.id).toBeTruthy();
    });

    test("lookupSlackUserByEmail returns null for unknown email", async () => {
      const { lookupSlackUserByEmail } = await import(
        "@/utils/messaging/providers/slack/users"
      );

      const unknown = await lookupSlackUserByEmail(
        emulatorClient,
        "nobody@example.com",
      );
      expect(unknown).toBeNull();
    });

    test("sendChannelConfirmation posts a message to the channel", async () => {
      const { sendChannelConfirmation } = await import(
        "@/utils/messaging/providers/slack/send"
      );
      const { listChannels } = await import(
        "@/utils/messaging/providers/slack/channels"
      );

      // Get the notifications channel ID
      const channels = await listChannels(emulatorClient);
      const notifChannel = channels.find(
        (c) => c.name === "inbox-zero-notifications",
      );
      expect(notifChannel).toBeDefined();

      // Send the confirmation message
      await sendChannelConfirmation({
        accessToken: "emulator-token",
        channelId: notifChannel!.id,
      });

      // Verify the message was posted by checking conversation history
      const history = await emulatorClient.conversations.history({
        channel: notifChannel!.id,
      });

      expect(history.ok).toBe(true);
      expect(history.messages).toBeDefined();
      expect(history.messages!.length).toBeGreaterThanOrEqual(1);

      const confirmationMsg = history.messages!.find((m) =>
        m.text?.includes("Inbox Zero connected"),
      );
      expect(confirmationMsg).toBeDefined();
    });

    test("sendMeetingBriefingToSlack posts blocks to channel", async () => {
      const { sendMeetingBriefingToSlack } = await import(
        "@/utils/messaging/providers/slack/send"
      );
      const { listChannels } = await import(
        "@/utils/messaging/providers/slack/channels"
      );

      const channels = await listChannels(emulatorClient);
      const notifChannel = channels.find(
        (c) => c.name === "inbox-zero-notifications",
      );
      expect(notifChannel).toBeDefined();

      await sendMeetingBriefingToSlack({
        accessToken: "emulator-token",
        channelId: notifChannel!.id,
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
        channel: notifChannel!.id,
      });

      expect(history.ok).toBe(true);
      // Find the briefing message by its fallback text
      const briefingMsg = history.messages!.find((m) =>
        m.text?.includes("Sprint Planning"),
      );
      expect(briefingMsg).toBeDefined();
      expect(briefingMsg!.text).toContain("2:00 PM");
    });

    test("sendDocumentFiledToSlack posts document filing notification", async () => {
      const { sendDocumentFiledToSlack } = await import(
        "@/utils/messaging/providers/slack/send"
      );
      const { listChannels } = await import(
        "@/utils/messaging/providers/slack/channels"
      );

      const channels = await listChannels(emulatorClient);
      const engChannel = channels.find((c) => c.name === "engineering");
      expect(engChannel).toBeDefined();

      await sendDocumentFiledToSlack({
        accessToken: "emulator-token",
        channelId: engChannel!.id,
        filename: "invoice-2026-03.pdf",
        folderPath: "Finance/Invoices/2026",
        driveProvider: "google",
      });

      const history = await emulatorClient.conversations.history({
        channel: engChannel!.id,
      });

      expect(history.ok).toBe(true);
      const filedMsg = history.messages!.find((m) =>
        m.text?.includes("invoice-2026-03.pdf"),
      );
      expect(filedMsg).toBeDefined();
      expect(filedMsg!.text).toContain("Finance/Invoices/2026");
    });

    test("sendDocumentAskToSlack posts ask notification", async () => {
      const { sendDocumentAskToSlack } = await import(
        "@/utils/messaging/providers/slack/send"
      );
      const { listChannels } = await import(
        "@/utils/messaging/providers/slack/channels"
      );

      const channels = await listChannels(emulatorClient);
      const engChannel = channels.find((c) => c.name === "engineering");
      expect(engChannel).toBeDefined();

      await sendDocumentAskToSlack({
        accessToken: "emulator-token",
        channelId: engChannel!.id,
        filename: "contract-draft-v2.docx",
        reasoning:
          "This looks like a legal contract but I'm not sure which folder it belongs in.",
      });

      const history = await emulatorClient.conversations.history({
        channel: engChannel!.id,
      });

      expect(history.ok).toBe(true);
      const askMsg = history.messages!.find((m) =>
        m.text?.includes("contract-draft-v2.docx"),
      );
      expect(askMsg).toBeDefined();
    });

    test("resolveSlackDestination returns channelId for non-DM channel", async () => {
      const { resolveSlackDestination } = await import(
        "@/utils/messaging/providers/slack/send"
      );
      const { listChannels } = await import(
        "@/utils/messaging/providers/slack/channels"
      );

      const channels = await listChannels(emulatorClient);
      const general = channels.find((c) => c.name === "general");
      expect(general).toBeDefined();

      const destination = await resolveSlackDestination({
        accessToken: "emulator-token",
        channelId: general!.id,
        providerUserId: null,
      });

      expect(destination).toBe(general!.id);
    });

    test("resolveSlackDestination returns null when no channel and no DM sentinel", async () => {
      const { resolveSlackDestination } = await import(
        "@/utils/messaging/providers/slack/send"
      );

      const destination = await resolveSlackDestination({
        accessToken: "emulator-token",
        channelId: null,
        providerUserId: null,
      });

      expect(destination).toBeNull();
    });
  },
);
