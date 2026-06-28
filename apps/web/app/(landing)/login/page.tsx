import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LoginForm } from "@/app/(landing)/login/LoginForm";
import {
  getEmailAlreadyLinkedDescription,
  getRequiresReconsentDescription,
} from "@/app/(landing)/login/messages";
import { env } from "@/env";
import { auth } from "@/utils/auth";
import { isGoogleOauthEmulationEnabled } from "@/utils/google/oauth";
import { getEnabledLoginProviders } from "@/utils/oauth/login-providers";
import { AlertBasic } from "@/components/Alert";
import { Button } from "@/components/ui/button";
import { WELCOME_PATH } from "@/utils/config";
import { CrispChatLoggedOutVisible } from "@/components/CrispChat";
import { MutedText } from "@/components/Typography";
import { normalizeInternalPath } from "@/utils/path";
import {
  BRAND_NAME,
  SUPPORT_EMAIL,
  getBrandTitle,
  getPossessiveBrandName,
} from "@/utils/branding";

export const metadata: Metadata = {
  title: getBrandTitle("Log in"),
  description: `Log in to ${BRAND_NAME}.`,
  alternates: { canonical: "/login" },
};

export default async function AuthenticationPage(props: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const searchParams = await props.searchParams;
  const session = await auth();
  const nextPath = normalizeInternalPath(searchParams?.next);
  const isSelfHosted = env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS;

  if (session?.user && !searchParams?.error) {
    redirect(nextPath ?? WELCOME_PATH);
  }

  const enabledProviders = Array.from(getEnabledLoginProviders());

  return (
    <div className="flex h-screen flex-col justify-center text-foreground">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
        <div className="flex flex-col text-center">
          <h1 className="font-title text-2xl text-foreground">Sign In</h1>
          <p className="mt-4 text-muted-foreground">
            Your AI personal assistant for email.
          </p>
        </div>
        <div className="mt-4">
          <Suspense>
            <LoginForm
              enabledProviders={enabledProviders}
              useGoogleOauthEmulator={isGoogleOauthEmulationEnabled()}
            />
          </Suspense>
        </div>

        {searchParams?.error && <ErrorAlert error={searchParams?.error} />}

        {!isSelfHosted ? (
          <MutedText className="px-8 pt-10 text-center">
            By clicking continue, you agree to our{" "}
            <Link
              href="/terms"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Privacy Policy
            </Link>
            .
          </MutedText>
        ) : null}

        <LoginFooter
          isSelfHosted={isSelfHosted}
          selfHostedLoginFooterText={
            env.NEXT_PUBLIC_SELF_HOSTED_LOGIN_FOOTER_TEXT || undefined
          }
        />
      </div>
    </div>
  );
}

function LoginFooter({
  isSelfHosted,
  selfHostedLoginFooterText,
}: {
  isSelfHosted?: boolean;
  selfHostedLoginFooterText?: string;
}) {
  if (isSelfHosted && selfHostedLoginFooterText !== undefined) {
    const trimmedFooterText = selfHostedLoginFooterText.trim();
    if (!trimmedFooterText || trimmedFooterText.toLowerCase() === "none") {
      return null;
    }

    return (
      <MutedText className="whitespace-pre-line px-4 pt-10 text-center">
        {selfHostedLoginFooterText}
      </MutedText>
    );
  }

  return (
    <MutedText
      className={
        isSelfHosted ? "px-4 pt-10 text-center" : "px-4 pt-4 text-center"
      }
    >
      {getPossessiveBrandName()} use and transfer of information received from
      Google APIs to any other app will adhere to{" "}
      <a
        href="https://developers.google.com/terms/api-services-user-data-policy"
        className="underline underline-offset-4 hover:text-foreground"
      >
        Google API Services User Data
      </a>{" "}
      Policy, including the Limited Use requirements.
    </MutedText>
  );
}

function ErrorAlert({ error }: { error: string }) {
  if (error === "RequiresReconsent") {
    return (
      <AlertBasic
        variant="destructive"
        title="Permissions need to be refreshed"
        description={getRequiresReconsentDescription({
          includeSupportText: true,
        })}
      />
    );
  }

  if (error === "OAuthAccountNotLinked") {
    return (
      <AlertBasic
        variant="destructive"
        title="Account already attached to another user"
        description={
          <>
            <span>You can merge accounts instead.</span>
            <Button asChild className="mt-2">
              <Link href="/accounts">Merge accounts</Link>
            </Button>
          </>
        }
      />
    );
  }

  if (error === "email_already_linked") {
    return (
      <AlertBasic
        variant="destructive"
        title="Email Already Linked"
        description={getEmailAlreadyLinkedDescription({
          includeSupportText: true,
        })}
      />
    );
  }

  return (
    <>
      <AlertBasic
        variant="destructive"
        title="Error logging in"
        description={`There was an error logging in. Please try logging in again. If this error persists please contact support at ${SUPPORT_EMAIL}`}
      />
      <Suspense>
        <CrispChatLoggedOutVisible />
      </Suspense>
    </>
  );
}
