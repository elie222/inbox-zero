"use server";

import { actionClientUser } from "@/utils/actions/safe-action";
import { updateEmailOtpBody } from "@/utils/actions/email-otp.validation";
import { updateEmailOtpSetting } from "@/utils/auth/email-otp-setting";

export const updateEmailOtpAction = actionClientUser
  .metadata({ name: "updateEmailOtp" })
  .inputSchema(updateEmailOtpBody)
  .action(async ({ ctx: { userId, session }, parsedInput: { enabled } }) =>
    updateEmailOtpSetting({
      userId,
      sessionId: session.session.id,
      enabled,
    }),
  );
