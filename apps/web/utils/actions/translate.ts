"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { translateThreadBody } from "@/utils/actions/translate.validation";
import { aiTranslateEmails } from "@/utils/ai/translate-email";
import { createEmailProvider } from "@/utils/email/provider";
import { SafeError } from "@/utils/error";
import { getLatestNonDraftMessage } from "@/utils/email/latest-message";
import { getMessageTimestamp } from "@/utils/email/message-timestamp";
import { emailToContent } from "@/utils/mail";
import { assertHasAiAccess } from "@/utils/premium/limits";
import { getEmailAccountWithAi } from "@/utils/user/get";

export const translateThreadAction = actionClient
  .metadata({ name: "translateThread" })
  .inputSchema(translateThreadBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { messageIds, targetLanguage },
    }) => {
      const emailAccount = await getEmailAccountWithAi({ emailAccountId });
      if (!emailAccount) throw new SafeError("Email account not found");

      await assertHasAiAccess({
        userId: emailAccount.userId,
        hasUserApiKey: !!emailAccount.user.aiApiKey,
      });

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });
      const messages = await emailProvider.getMessagesBatch(messageIds);
      if (!messages.length) throw new SafeError("Email not found");

      const subject =
        getLatestNonDraftMessage({
          messages,
          getTimestamp: getMessageTimestamp,
        })?.headers.subject ?? "";
      const [subjectTranslation, ...messageTranslations] =
        await aiTranslateEmails({
          texts: [
            subject,
            // Quoted history repeats earlier messages, which get their own
            // translation, so only each message's new text is sent.
            ...messages.map((message) =>
              emailToContent(message, { maxLength: 0, extractReply: true }),
            ),
          ],
          targetLanguage,
          emailAccount,
        });

      const translationsById = new Map(
        messages.map((message, index) => [
          message.id,
          messageTranslations[index],
        ]),
      );

      return {
        subject: subjectTranslation.text,
        // Messages the provider didn't return come back untranslated, so the
        // client records them as handled instead of re-requesting them forever.
        messages: messageIds.map((id) => ({
          id,
          ...(translationsById.get(id) ?? { text: "", sourceLanguage: null }),
        })),
      };
    },
  );
