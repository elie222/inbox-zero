import { NextResponse } from "next/server";
import { z } from "zod";
import { withError } from "@/utils/middleware";
import { withQstashOrInternal } from "@/utils/qstash";
import {
  observationSchema,
  pendingCorrectionSchema,
} from "@/utils/mail-corrections/changes";
import { filterObservedSpam } from "@/utils/spam/observe";
import { learnSpamCorrection } from "@/utils/spam/feedback";

const requestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("arrivals"),
    emailAccountId: z.string().min(1),
    arrivals: z.array(observationSchema).max(20),
  }),
  z.object({
    kind: z.literal("correction"),
    emailAccountId: z.string().min(1),
    change: pendingCorrectionSchema,
  }),
]);
export const maxDuration = 120;
export const POST = withError(
  "spam-filter/observe",
  withQstashOrInternal(async (request) => {
    const body = requestSchema.parse(await request.json());
    if (body.kind === "correction")
      return NextResponse.json({
        outcome: await learnSpamCorrection(
          body.emailAccountId,
          body.change,
          request.logger,
        ),
      });
    await filterObservedSpam({
      emailAccountId: body.emailAccountId,
      observations: body.arrivals,
      previous: {},
      initialized: true,
      logger: request.logger,
    });
    return NextResponse.json({ outcome: "processed" });
  }),
);
