"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/Button";
import { Button as UIButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { signIn, signUp, signInWithOauth2 } from "@/utils/auth-client";
import { WELCOME_PATH } from "@/utils/config";
import { toastError } from "@/components/Toast";
import { normalizeInternalPath } from "@/utils/path";
import { getPossessiveBrandName } from "@/utils/branding";
import { AlertBasic } from "@/components/Alert";
import { createClientLogger } from "@/utils/logger-client";

const logger = createClientLogger("login/LoginForm");

export function LoginForm({
  useGoogleOauthEmulator,
}: {
  useGoogleOauthEmulator: boolean;
}) {
  const searchParams = useSearchParams();
  const next = searchParams?.get("next");
  const { callbackURL, errorCallbackURL } = getAuthCallbackUrls(next);

  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingMicrosoft, setLoadingMicrosoft] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoadingGoogle(true);
    setGoogleError(null);
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
        window.location.href = result.url;
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
      setGoogleError(description);
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

  const handleEmailSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoadingEmail(true);
    setEmailError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const name = formData.get("name") as string | null;

    try {
      if (isSignUp) {
        const result = await signUp.email({
          email,
          password,
          name: name || email.split("@")[0],
          callbackURL,
        });
        if (result.error) {
          throw new Error(result.error.message || "Sign up failed");
        }
      } else {
        const result = await signIn.email({
          email,
          password,
          callbackURL,
        });
        if (result.error) {
          throw new Error(result.error.message || "Sign in failed");
        }
      }
    } catch (error) {
      const description = getSocialSignInErrorMessage(error);
      logger.error("Error with email auth", { error });
      setEmailError(description);
      toastError({
        title: isSignUp ? "Error signing up" : "Error signing in",
        description,
      });
    } finally {
      setLoadingEmail(false);
    }
  };

  return (
    <div className="flex flex-col justify-center gap-2 px-4 sm:px-16">
      <Dialog>
        <DialogTrigger asChild>
          <Button size="2xl">
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
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign in</DialogTitle>
          </DialogHeader>
          <DialogDescription className="mt-1 text-sm leading-6 text-slate-700 dark:text-foreground">
            {getPossessiveBrandName()} use and transfer of information received
            from Google APIs to any other app will adhere to{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              className="underline underline-offset-4 hover:text-gray-900"
            >
              Google API Services User Data
            </a>{" "}
            Policy, including the Limited Use requirements.
          </DialogDescription>
          {googleError ? (
            <AlertBasic
              variant="destructive"
              title="Failed to start Google sign-in"
              description={googleError}
            />
          ) : null}
          <div>
            <Button loading={loadingGoogle} onClick={handleGoogleSignIn}>
              I agree
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

      <UIButton
        variant="ghost"
        size="lg"
        className="w-full hover:scale-105 transition-transform"
        asChild
      >
        <Link href="/login/sso">Sign in with SSO</Link>
      </UIButton>

      <div className="relative my-2">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            Or continue with email
          </span>
        </div>
      </div>

      <form onSubmit={handleEmailSubmit} className="flex flex-col gap-2">
        {isSignUp && (
          <Input
            name="name"
            type="text"
            placeholder="Name"
            autoComplete="name"
          />
        )}
        <Input
          name="email"
          type="email"
          placeholder="Email"
          required
          autoComplete="email"
        />
        <Input
          name="password"
          type="password"
          placeholder="Password"
          required
          minLength={8}
          autoComplete={isSignUp ? "new-password" : "current-password"}
        />
        {emailError && <p className="text-sm text-destructive">{emailError}</p>}
        <Button loading={loadingEmail} type="submit">
          {isSignUp ? "Sign up" : "Sign in"} with email
        </Button>
        <UIButton
          variant="link"
          type="button"
          className="text-xs"
          onClick={() => {
            setIsSignUp((v) => !v);
            setEmailError(null);
          }}
        >
          {isSignUp
            ? "Already have an account? Sign in"
            : "Don't have an account? Sign up"}
        </UIButton>
      </form>
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
  provider: "google" | "microsoft";
  providerName: "Google" | "Microsoft";
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
    return error.message;
  }

  return "Please try again or contact support.";
}
