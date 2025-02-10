"use server";

import { categorize } from "@/app/api/ai/categorize/controller";
import {
  type CategorizeBodyWithHtml,
  categorizeBodyWithHtml,
} from "@/app/api/ai/categorize/validation";
import { getSessionAndGmailClient } from "@/utils/actions/helpers";
import { hasPreviousEmailsFromSender } from "@/utils/gmail/message";
import { emailToContent } from "@/utils/mail";
import { findUnsubscribeLink } from "@/utils/parse/parseHtml.server";
import { truncate } from "@/utils/string";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { validateUserAndAiAccess } from "@/utils/user/validate";
import { isActionError } from "@/utils/error";
import { internalDateToDate } from "@/utils/date";

export const categorizeEmailAction = withActionInstrumentation(
  "categorizeEmail",
  async (unsafeData: CategorizeBodyWithHtml) => {
    const sessionResult = await getSessionAndGmailClient();
    if (isActionError(sessionResult)) return sessionResult;
    const { gmail, user: u } = sessionResult;

    const userResult = await validateUserAndAiAccess(u.id);
    if (isActionError(userResult)) return userResult;
    const { user } = userResult;

    const {
      success,
      data,
      error: parseError,
    } = categorizeBodyWithHtml.safeParse(unsafeData);
    if (!success) return { error: parseError.message };

    const content = emailToContent({
      textHtml: data.textHtml || undefined,
      textPlain: data.textPlain || undefined,
      snippet: data.snippet || "",
    });

    const unsubscribeLink = findUnsubscribeLink(data.textHtml);
    const hasPreviousEmail = await hasPreviousEmailsFromSender(gmail, {
      from: data.from,
      messageId: data.messageId,
      date: internalDateToDate(data.internalDate),
    });

    const res = await categorize(
      {
        ...data,
        content,
        snippet: data.snippet || truncate(content, 300),
        aiApiKey: user.aiApiKey,
        aiProvider: user.aiProvider,
        aiModel: user.aiModel,
        unsubscribeLink,
        hasPreviousEmail,
      },
      { email: u.email },
    );

    return { category: res?.category };
  },
);
