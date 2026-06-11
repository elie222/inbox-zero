"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { Button as UIButton } from "@/components/ui/button";
import { signIn, signInWithOauth2 } from "@/utils/auth-client";
import { WELCOME_PATH } from "@/utils/config";
import { toastError } from "@/components/Toast";
import { normalizeInternalPath } from "@/utils/path";
import { buildRedirectUrl, redirectToSafeUrl } from "@/utils/redirect";
import { createClientLogger } from "@/utils/logger-client";
import type { LoginProvider } from "@/utils/oauth/login-providers";

const logger = createClientLogger("login/LoginForm");
const CONNECT_MAILBOX_PATH = "/connect-mailbox";

export function LoginForm({
  enabledProviders,
  useGoogleOauthEmulator,
}: {
  enabledProviders: readonly LoginProvider[];
  useGoogleOauthEmulator: boolean;
}) {
  const searchParams = useSearchParams();
  const next = searchParams?.get("next");
  const { callbackURL, errorCallbackURL } = getAuthCallbackUrls(next);
  const appleCallbackURL = buildConnectMailboxUrl(callbackURL);
  const showAppleLogin = enabledProviders.includes("apple");
  const showGoogleLogin = enabledProviders.includes("google");
  const showMicrosoftLogin = enabledProviders.includes("microsoft");
  const showSsoLogin = enabledProviders.includes("sso");

  const [loadingApple, setLoadingApple] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingMicrosoft, setLoadingMicrosoft] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoadingGoogle(true);
    try {
      if (useGoogleOauthEmulator) {
        const result = await signInWithOauth2({
          providerId: "google",
          errorCallbackURL,
          callbackURL,
        });
        if (!result.url) {
          throw new Error("Missing Google sign-in redirect URL");
        }
        redirectToSafeUrl(result.url, { allowExternal: true });
      } else {
        await signIn.social({
          provider: "google",
          errorCallbackURL,
          callbackURL,
        });
      }
    } catch (error) {
      const description = getSocialSignInErrorMessage(error);
      logger.error("Error signing in with Google", { error });
      toastError({
        title: "Error signing in with Google",
        description,
      });
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleMicrosoftSignIn = async () => {
    await handleSocialSignIn({
      provider: "microsoft",
      providerName: "Microsoft",
      callbackURL,
      errorCallbackURL,
      setLoading: setLoadingMicrosoft,
    });
  };

  return (
    <div className="flex flex-col justify-center gap-2 px-4 sm:px-16">
      {showGoogleLogin ? (
        <Button size="2xl" loading={loadingGoogle} onClick={handleGoogleSignIn}>
          <span className="flex items-center justify-center">
            <Image
              src="/images/google.svg"
              alt="Google"
              width={24}
              height={24}
              unoptimized
            />
            <span className="ml-2">Sign in with Google</span>
          </span>
        </Button>
      ) : null}

      {showMicrosoftLogin ? (
        <Button
          size="2xl"
          loading={loadingMicrosoft}
          onClick={handleMicrosoftSignIn}
        >
          <span className="flex items-center justify-center">
            <Image
              src="/images/microsoft.svg"
              alt="Microsoft"
              width={24}
              height={24}
              unoptimized
            />
            <span className="ml-2">Sign in with Microsoft</span>
          </span>
        </Button>
      ) : null}

      {showAppleLogin ? (
        <UIButton
          variant="ghost"
          size="lg"
          className="w-full hover:scale-105 transition-transform"
          loading={loadingApple}
          onClick={() =>
            handleSocialSignIn({
              provider: "apple",
              providerName: "Apple",
              callbackURL: appleCallbackURL,
              errorCallbackURL,
              setLoading: setLoadingApple,
            })
          }
        >
          Sign in with Apple
        </UIButton>
      ) : null}

      {showSsoLogin ? (
        <UIButton
          variant="ghost"
          size="lg"
          className="w-full hover:scale-105 transition-transform"
          asChild
        >
          <Link href="/login/sso">Sign in with SSO</Link>
        </UIButton>
      ) : null}
    </div>
  );
}

function getAuthCallbackUrls(next: string | null) {
  const callbackURL = normalizeInternalPath(next) ?? WELCOME_PATH;
  const errorCallbackURL = isOrganizationInvitationPath(callbackURL)
    ? "/login/error?reason=org_invite"
    : "/login/error";

  return { callbackURL, errorCallbackURL };
}

function buildConnectMailboxUrl(nextPath: string) {
  if (nextPath === CONNECT_MAILBOX_PATH) return CONNECT_MAILBOX_PATH;
  return buildRedirectUrl(CONNECT_MAILBOX_PATH, { next: nextPath });
}

function isOrganizationInvitationPath(path: string) {
  const pathname = path.split("?")[0];
  return /^\/organizations\/invitations\/[^/]+\/accept\/?$/.test(pathname);
}

async function handleSocialSignIn({
  provider,
  providerName,
  callbackURL,
  errorCallbackURL,
  setLoading,
}: {
  provider: "apple" | "google" | "microsoft";
  providerName: "Apple" | "Google" | "Microsoft";
  callbackURL: string;
  errorCallbackURL: string;
  setLoading: (loading: boolean) => void;
}) {
  setLoading(true);
  try {
    await signIn.social({
      provider,
      errorCallbackURL,
      callbackURL,
    });
  } catch (error) {
    const description = getSocialSignInErrorMessage(error);
    logger.error(`Error signing in with ${providerName}`, { error });
    toastError({
      title: `Error signing in with ${providerName}`,
      description,
    });
  } finally {
    setLoading(false);
  }
}

function getSocialSignInErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    if (isNetworkSignInError(error.message)) {
      return "Could not start sign-in. Please check that this app is opened from its configured public URL, then try again.";
    }

    return error.message;
  }

  return "Please try again or contact support.";
}

function isNetworkSignInError(message: string) {
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage === "load failed" ||
    normalizedMessage === "failed to fetch" ||
    normalizedMessage === "networkerror when attempting to fetch resource."
  );
}
