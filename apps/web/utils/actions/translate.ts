"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { translateThreadBody } from "@/utils/actions/translate.validation";
import { aiTranslateEmails } from "@/utils/ai/translate-email";
import { createEmailProvider } from "@/utils/email/provider";
import { SafeError } from "@/utils/error";
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

      const subject = messages.at(-1)?.headers.subject ?? "";
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

      return {
        subject: subjectTranslation.text,
        messages: messages.map((message, index) => ({
          id: message.id,
          ...messageTranslations[index],
        })),
      };
    },
  );
