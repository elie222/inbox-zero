import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/app/(landing)/login/LoginForm";
import { auth } from "@/utils/auth";
import { getBrandTitle } from "@/utils/branding";
import { WELCOME_PATH } from "@/utils/config";
import { normalizeInternalPath } from "@/utils/path";
import { getEnabledLoginProviders } from "@/utils/oauth/login-providers";

export const metadata: Metadata = {
  title: getBrandTitle("Other sign-in options"),
};

export default async function LoginOptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const session = await auth();
  if (session?.user)
    redirect(normalizeInternalPath(params.next) ?? WELCOME_PATH);

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-center font-title text-2xl">
          Other sign-in options
        </h1>
        <Suspense>
          <LoginForm
            enabledProviders={Array.from(getEnabledLoginProviders())}
            useGoogleOauthEmulator={false}
            otherOptions
          />
        </Suspense>
      </div>
    </main>
  );
}
