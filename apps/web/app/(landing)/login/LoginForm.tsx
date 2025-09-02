"use client";

import { useState } from "react";
import { signIn } from "@/utils/auth-client";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";
import { SectionDescription } from "@/components/Typography";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { WELCOME_PATH } from "@/utils/config";

import { toastError, toastSuccess } from "@/components/Toast";

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams?.get("next");
  const error = searchParams?.get("error");
  const providerId = searchParams?.get("providerId");

  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingMicrosoft, setLoadingMicrosoft] = useState(false);
  const [loadingSSO, setLoadingSSO] = useState(false);
  const [showSSOForm, setShowSSOForm] = useState(false);
  const [email, setEmail] = useState("");

  const handleGoogleSignIn = async () => {
    setLoadingGoogle(true);
    await signIn.social({
      provider: "google",
      errorCallbackURL: "/login/error",
      callbackURL: next && next.length > 0 ? next : WELCOME_PATH,
      ...(error === "RequiresReconsent" ? { consent: true } : {}),
    });
    setLoadingGoogle(false);
  };

  const handleMicrosoftSignIn = async () => {
    setLoadingMicrosoft(true);
    await signIn.social({
      provider: "microsoft",
      errorCallbackURL: "/login/error",
      callbackURL: next && next.length > 0 ? next : WELCOME_PATH,
      ...(error === "RequiresReconsent" ? { consent: true } : {}),
    });
    setLoadingMicrosoft(false);
  };

  const handleSSOSignIn = () => {
    setShowSSOForm(true);
  };

  const handleSSOContinue = async () => {
    if (!email) return;

    setLoadingSSO(true);

    try {
      // Build URL with search parameters
      const url = new URL("/api/sso/signin", window.location.origin);
      url.searchParams.set("email", email);
      if (providerId) {
        url.searchParams.set("providerId", providerId);
      }

      const response = await fetch(url.toString());
      const data = await response.json();

      if (!response.ok) {
        toastError({
          title: "SSO Sign-in Error",
          description: data.error || "Failed to initiate SSO sign-in",
        });
        return;
      }

      if (data.redirectUrl) {
        toastSuccess({ description: "Redirecting to SSO provider..." });
        window.location.href = data.redirectUrl;
      }
    } catch {
      toastError({
        title: "SSO Sign-in Error",
        description: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setLoadingSSO(false);
    }
  };

  const handleBackToSocial = () => {
    setShowSSOForm(false);
    setEmail("");
  };

  if (showSSOForm) {
    return (
      <div className="flex flex-col justify-center gap-4 px-4 sm:px-8 max-w-md mx-auto">
        <div className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-foreground"
            >
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              placeholder="Enter your email address"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEmail(e.target.value)
              }
              required
              className="mt-1 block w-full rounded-md border border-slate-300 bg-background px-4 py-3 text-base shadow-sm focus:border-black focus:ring-black disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted-foreground disabled:ring-slate-200 dark:border-slate-700 dark:text-slate-100 dark:focus:border-slate-400 dark:focus:ring-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-400 dark:disabled:ring-slate-700"
            />
          </div>

          <Button
            size="2xl"
            full
            loading={loadingSSO}
            onClick={handleSSOContinue}
            disabled={!email}
          >
            Continue
          </Button>

          <div className="text-center">
            <button
              type="button"
              onClick={handleBackToSocial}
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Back to social login options
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-center gap-2 px-4 sm:px-16">
      <Dialog>
        <DialogTrigger asChild>
          <Button size="2xl">
            <span className="flex items-center justify-center">
              <Image
                src="/images/google.svg"
                alt=""
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
          <SectionDescription>
            Inbox Zero{"'"}s use and transfer of information received from
            Google APIs to any other app will adhere to{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              className="underline underline-offset-4 hover:text-gray-900"
            >
              Google API Services User Data
            </a>{" "}
            Policy, including the Limited Use requirements.
          </SectionDescription>
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
            alt=""
            width={24}
            height={24}
            unoptimized
          />
          <span className="ml-2">Sign in with Microsoft</span>
        </span>
      </Button>

      <Button size="2xl" loading={loadingSSO} onClick={handleSSOSignIn}>
        <span className="flex items-center justify-center">
          <span className="ml-2">Sign in with SSO</span>
        </span>
      </Button>
    </div>
  );
}
