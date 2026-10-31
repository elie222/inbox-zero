import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/utils/middleware";
import {
  isFakePushTransport,
  sendMobilePushNotification,
  takeRecordedPushSends,
} from "@/utils/mobile-push";

const testPushSchema = z.object({
  title: z.string().min(1).max(256),
  body: z.string().min(1).max(2048),
  data: z.record(z.string(), z.string()).optional(),
});

export type TestPushResponse = {
  sends: ReturnType<typeof takeRecordedPushSends>;
};

export const POST = withAuth("mobile/push/test", async (request) => {
  if (!isFakePushTransport()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = testPushSchema.parse(await request.json());
  takeRecordedPushSends();
  await sendMobilePushNotification({
    userId: request.auth.userId,
    deduplicationKey: `test:${crypto.randomUUID()}`,
    notification: {
      title: body.title,
      body: body.body,
      sound: "default",
      data: body.data,
    },
    logger: request.logger,
  });

  return NextResponse.json({
    sends: takeRecordedPushSends(),
  } satisfies TestPushResponse);
});
