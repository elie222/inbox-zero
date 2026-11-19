import { getLinkingOAuth2Client } from "@/utils/gmail/client";
import { SCOPES } from "@/utils/gmail/scopes";
import { getLinkingOAuth2Url } from "@/utils/outlook/client";

export function getAccountLinkingAuthorizationUrl({
  provider,
  state,
  loginHint,
}: {
  provider: "google" | "microsoft";
  state: string;
  loginHint?: string;
}) {
  if (provider === "microsoft") {
    const url = new URL(getLinkingOAuth2Url({ loginHint }));
    url.searchParams.set("state", state);
    return url.toString();
  }

  return getLinkingOAuth2Client().generateAuthUrl({
    access_type: "offline",
    scope: [...new Set([...SCOPES, "openid", "email"])].join(" "),
    prompt: "consent",
    state,
    ...(loginHint && { login_hint: loginHint }),
  });
}
