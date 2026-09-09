import { expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { getEmailAccount } from "../account-test-helpers";

const UPCOMING_EVENT_ID = "evt_playwright_meeting_bot";
const RECORDED_MEETING_ID_PREFIX = "playwright_meeting_bot_recorded";
const RECORDING_ID_PREFIX = "playwright_meeting_bot_recording";
const CALENDAR_CONNECTION_ID_PREFIX = "playwright_meeting_bot_calendar";

export type MeetingBotFixture = {
  emailAccountId: string;
  previousPremiumId: string | null;
  previousSettings: {
    enabled: boolean;
    joinRule: string;
    recapEmailEnabled: boolean;
    followUpDraftEnabled: boolean;
  };
  premiumId: string;
  recordedMeetingId: string;
  recordingId: string;
  calendarConnectionId: string;
};

export async function prepareMeetingBotFixture(
  page: Page,
): Promise<MeetingBotFixture> {
  const { id: emailAccountId } = await getEmailAccount(page);
  const runId = process.env.PLAYWRIGHT_RUN_ID ?? "local";
  const premiumId = `playwright_meeting_bot_premium_${runId}`;
  const recordedMeetingId = `${RECORDED_MEETING_ID_PREFIX}_${emailAccountId}`;
  const recordingId = `${RECORDING_ID_PREFIX}_${emailAccountId}`;
  const calendarConnectionId = `${CALENDAR_CONNECTION_ID_PREFIX}_${emailAccountId}`;

  return withClient(async (client) => {
    const result = await client.query<{
      accessToken: string | null;
      email: string;
      expiresAt: Date | null;
      followUpDraftEnabled: boolean;
      joinRule: string;
      meetingRecorderEnabled: boolean;
      premiumId: string | null;
      recapEmailEnabled: boolean;
      refreshToken: string | null;
    }>(
      `SELECT
         ea.email,
         ea."meetingRecorderEnabled",
         ea."meetingRecorderJoinRule"::text AS "joinRule",
         ea."meetingRecorderRecapEmailEnabled" AS "recapEmailEnabled",
         ea."meetingRecorderFollowUpDraftEnabled" AS "followUpDraftEnabled",
         u."premiumId",
         account.access_token AS "accessToken",
         account.refresh_token AS "refreshToken",
         account.expires_at AS "expiresAt"
       FROM "EmailAccount" ea
       JOIN "User" u ON u.id = ea."userId"
       JOIN "Account" account ON account.id = ea."accountId"
       WHERE ea.id = $1`,
      [emailAccountId],
    );
    const account = result.rows[0];
    if (!account) throw new Error("The Playwright email account was not found");

    await deleteFixtureRows(client, {
      emailAccountId,
      recordedMeetingId,
      recordingId,
      calendarConnectionId,
    });

    await client.query(
      `INSERT INTO "Premium" (
         id, "createdAt", "updatedAt", "pendingInvites", tier,
         "adminGrantTier", "adminGrantExpiresAt"
       )
       VALUES (
         $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ARRAY[]::text[],
         'PLUS_MONTHLY', 'PLUS_MONTHLY', CURRENT_TIMESTAMP + INTERVAL '1 day'
       )
       ON CONFLICT (id) DO UPDATE
       SET
         tier = EXCLUDED.tier,
         "adminGrantTier" = EXCLUDED."adminGrantTier",
         "adminGrantExpiresAt" = EXCLUDED."adminGrantExpiresAt",
         "updatedAt" = CURRENT_TIMESTAMP`,
      [premiumId],
    );
    await client.query(
      `UPDATE "User"
       SET "premiumId" = $2, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = (SELECT "userId" FROM "EmailAccount" WHERE id = $1)`,
      [emailAccountId, premiumId],
    );
    await client.query(
      `UPDATE "EmailAccount"
       SET
         "meetingRecorderEnabled" = false,
         "meetingRecorderJoinRule" = 'OFF',
         "meetingRecorderRecapEmailEnabled" = true,
         "meetingRecorderFollowUpDraftEnabled" = true,
         "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [emailAccountId],
    );

    await client.query(
      `INSERT INTO "CalendarConnection" (
         id, "createdAt", "updatedAt", provider, email,
         "accessToken", "refreshToken", "expiresAt", "isConnected",
         "emailAccountId"
       )
       VALUES (
         $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'google', $2,
         $3, $4, $5, true, $6
       )`,
      [
        calendarConnectionId,
        account.email,
        account.accessToken,
        account.refreshToken,
        account.expiresAt,
        emailAccountId,
      ],
    );
    await client.query(
      `INSERT INTO "Calendar" (
         id, "createdAt", "updatedAt", "calendarId", name, "primary",
         "isEnabled", timezone, "connectionId"
       )
       VALUES (
         $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'primary', $2, true,
         true, 'UTC', $3
       )`,
      [
        `playwright_meeting_bot_primary_${emailAccountId}`,
        account.email,
        calendarConnectionId,
      ],
    );

    await seedRecordedMeeting(client, {
      emailAccountId,
      recordedMeetingId,
      recordingId,
    });

    return {
      emailAccountId,
      previousPremiumId: account.premiumId,
      previousSettings: {
        enabled: account.meetingRecorderEnabled,
        joinRule: account.joinRule,
        recapEmailEnabled: account.recapEmailEnabled,
        followUpDraftEnabled: account.followUpDraftEnabled,
      },
      premiumId,
      recordedMeetingId,
      recordingId,
      calendarConnectionId,
    };
  });
}

export async function cleanUpMeetingBotFixture(fixture: MeetingBotFixture) {
  await withClient(async (client) => {
    await deleteFixtureRows(client, fixture);
    await client.query(
      `UPDATE "EmailAccount"
       SET
         "meetingRecorderEnabled" = $2,
         "meetingRecorderJoinRule" = $3::"MeetingJoinRule",
         "meetingRecorderRecapEmailEnabled" = $4,
         "meetingRecorderFollowUpDraftEnabled" = $5,
         "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        fixture.emailAccountId,
        fixture.previousSettings.enabled,
        fixture.previousSettings.joinRule,
        fixture.previousSettings.recapEmailEnabled,
        fixture.previousSettings.followUpDraftEnabled,
      ],
    );
    await client.query(
      `UPDATE "User"
       SET "premiumId" = $2, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "premiumId" = $3
         AND id = (SELECT "userId" FROM "EmailAccount" WHERE id = $1)`,
      [fixture.emailAccountId, fixture.previousPremiumId, fixture.premiumId],
    );
    await client.query(`DELETE FROM "Premium" WHERE id = $1`, [
      fixture.premiumId,
    ]);
  });
}

export async function openMeetings(page: Page, fixture: MeetingBotFixture) {
  await page.goto(`/${fixture.emailAccountId}/meetings`);
  await expect(page).toHaveURL(
    new RegExp(`/${fixture.emailAccountId}/meetings(?:\\?.*)?$`),
  );
}

async function seedRecordedMeeting(
  client: Client,
  fixture: Pick<
    MeetingBotFixture,
    "emailAccountId" | "recordedMeetingId" | "recordingId"
  >,
) {
  const transcript = [
    {
      speakerName: "Alex",
      startTime: 0,
      endTime: 8,
      text: "We will ship the onboarding improvements on Friday.",
      isHost: true,
    },
    {
      speakerName: "Jordan",
      startTime: 9,
      endTime: 16,
      text: "I will prepare the customer announcement.",
      isHost: false,
    },
  ];
  const summary = {
    overview: "The team finalized the launch plan for onboarding improvements.",
    keyDecisions: ["Release the onboarding improvements on Friday."],
    actionItems: [
      {
        description: "Prepare the customer announcement.",
        owner: "Jordan",
      },
    ],
    openQuestions: [],
    nextSteps: ["Review the release checklist tomorrow."],
  };

  await client.query(
    `INSERT INTO "MeetingRecording" (
       id, "createdAt", "updatedAt", "meetingUrl", "normalizedMeetingUrl",
       "meetingStartTime", status, transcript, "transcriptFetchedAt",
       "emailAccountId"
     )
     VALUES (
       $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
       'https://meet.google.com/recorded-demo',
       'https://meet.google.com/recorded-demo',
       CURRENT_TIMESTAMP - INTERVAL '2 hours', 'DONE', $2::jsonb,
       CURRENT_TIMESTAMP - INTERVAL '1 hour', $3
     )`,
    [fixture.recordingId, JSON.stringify(transcript), fixture.emailAccountId],
  );
  await client.query(
    `INSERT INTO "Meeting" (
       id, "createdAt", "updatedAt", "calendarEventId", "eventTitle",
       "startTime", "endTime", attendees, "organizerEmail", "joinOverride",
       "processingStatus", summary, "followUpDraftId", "recapSentAt",
       "recordingId", "emailAccountId"
     )
     VALUES (
       $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
       'evt_playwright_recorded_meeting', 'Recorded product review',
       CURRENT_TIMESTAMP - INTERVAL '2 hours',
       CURRENT_TIMESTAMP - INTERVAL '1 hour',
       $2::jsonb, 'playwright-host@example.com', true,
       'COMPLETED', $3::jsonb, 'playwright-follow-up-draft',
       CURRENT_TIMESTAMP - INTERVAL '45 minutes', $4, $5
     )`,
    [
      fixture.recordedMeetingId,
      JSON.stringify([
        { email: "playwright-host@example.com", name: "Alex" },
        { email: "external-attendee@example.com", name: "Jordan" },
      ]),
      JSON.stringify(summary),
      fixture.recordingId,
      fixture.emailAccountId,
    ],
  );
}

async function deleteFixtureRows(
  client: Client,
  fixture: Pick<
    MeetingBotFixture,
    | "emailAccountId"
    | "recordedMeetingId"
    | "recordingId"
    | "calendarConnectionId"
  >,
) {
  await client.query(
    `DELETE FROM "Meeting"
     WHERE "emailAccountId" = $1
       AND (id = $2 OR "calendarEventId" = $3)`,
    [fixture.emailAccountId, fixture.recordedMeetingId, UPCOMING_EVENT_ID],
  );
  await client.query(`DELETE FROM "MeetingRecording" WHERE id = $1`, [
    fixture.recordingId,
  ]);
  await client.query(`DELETE FROM "CalendarConnection" WHERE id = $1`, [
    fixture.calendarConnectionId,
  ]);
}

async function withClient<T>(callback: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}
