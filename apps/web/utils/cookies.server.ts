import { cookies } from "next/headers";
import { LAST_EMAIL_ACCOUNT_COOKIE } from "@/utils/cookies";

export async function clearLastEmailAccountCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(LAST_EMAIL_ACCOUNT_COOKIE);
}
