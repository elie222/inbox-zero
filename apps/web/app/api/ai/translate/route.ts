import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { translateBody } from "@/app/api/ai/translate/validation";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { assertHasAiAccess } from "@/utils/premium/limits";
import { aiTranslateEmails } from "@/utils/ai/translate-email";

export const maxDuration = 60;

export type TranslateResponse = { translations: string[] };

export const POST = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const json = await request.json();
  const body = translateBody.parse(json);

  const emailAccount = await getEmailAccountWithAi({ emailAccountId });

  if (!emailAccount) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await assertHasAiAccess({
    userId: emailAccount.userId,
    hasUserApiKey: !!emailAccount.user.aiApiKey,
  });

  const translations = await aiTranslateEmails({
    texts: body.texts,
    targetLanguage: body.targetLanguage,
    emailAccount,
  });

  return NextResponse.json({ translations } satisfies TranslateResponse);
});
