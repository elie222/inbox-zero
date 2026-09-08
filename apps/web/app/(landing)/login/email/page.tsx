import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmailOtpForm } from "@/app/(landing)/login/email/EmailOtpForm";
import { auth } from "@/utils/auth";
import { getBrandTitle } from "@/utils/branding";
import { WELCOME_PATH } from "@/utils/config";
import { normalizeInternalPath } from "@/utils/path";

export const metadata: Metadata = {
  title: getBrandTitle("Sign in with email"),
};

export default async function EmailLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const callbackURL = normalizeInternalPath(params.next) ?? WELCOME_PATH;
  const session = await auth();
  if (session?.user) redirect(callbackURL);

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <EmailOtpForm callbackURL={callbackURL} />
      </div>
    </main>
  );
}
