import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import { disableUnusedAutoDrafts } from "./disable-unused-auto-drafts";

export const maxDuration = 300;

export const POST = withError(
  "reply-tracker/disable-unused-auto-draft",
  async (request) => {
    if (!(await hasPostCronSecret(request))) {
      captureException(
        new Error("Unauthorized cron request: api/auto-draft/disable-unused"),
      );
      return new Response("Unauthorized", { status: 401 });
    }

    const results = await disableUnusedAutoDrafts();
    return NextResponse.json(results);
  },
);
