"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { SectionDescription } from "@/components/Typography";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { signIn } from "@/utils/auth-client";
import { WELCOME_PATH } from "@/utils/config";

// Validation schema for SSO form
const ssoFormSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  organizationName: z.string().min(1, "Organization name is required"),
});

type SSOFormData = z.infer<typeof ssoFormSchema>;

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams?.get("next");
  const error = searchParams?.get("error");
  const providerId = searchParams?.get("providerId");

  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingMicrosoft, setLoadingMicrosoft] = useState(false);
  const [loadingSSO, setLoadingSSO] = useState(false);
  const [showSSOForm, setShowSSOForm] = useState(false);

  // React Hook Form setup
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<SSOFormData>({
    resolver: zodResolver(ssoFormSchema),
  });

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

  const onSubmitSSO: SubmitHandler<SSOFormData> = useCallback(
    async (data) => {
      try {
        // Build URL with search parameters
        const url = new URL("/api/sso/signin", window.location.origin);
        url.searchParams.set("email", data.email);
        url.searchParams.set("organizationSlug", data.organizationName);
        if (providerId) {
          url.searchParams.set("providerId", providerId);
        }

        const response = await fetch(url.toString());
        const responseData = await response.json();

        if (!response.ok) {
          toastError({
            title: "SSO Sign-in Error",
            description: responseData.error || "Failed to initiate SSO sign-in",
          });
          return;
        }

        if (responseData.redirectUrl) {
          toastSuccess({ description: "Redirecting to SSO provider..." });
          window.location.href = responseData.redirectUrl;
        }
      } catch {
        toastError({
          title: "SSO Sign-in Error",
          description: "An unexpected error occurred. Please try again.",
        });
      }
    },
    [providerId],
  );

  const handleBackToSocial = () => {
    setShowSSOForm(false);
    reset();
  };

  if (showSSOForm) {
    return (
      <div className="flex flex-col justify-center gap-4 px-4 sm:px-8 max-w-md mx-auto">
        <form className="space-y-4" onSubmit={handleSubmit(onSubmitSSO)}>
          <Input
            type="email"
            name="email"
            label="Email"
            placeholder="Enter your email address"
            registerProps={register("email")}
            error={errors.email}
          />

          <Input
            type="text"
            name="organizationName"
            label="Organization Name"
            placeholder="Enter your organization name"
            registerProps={register("organizationName")}
            error={errors.organizationName}
          />

          <Button type="submit" size="2xl" full loading={isSubmitting}>
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
        </form>
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

      <button
        type="button"
        onClick={handleSSOSignIn}
        className="w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition-transform hover:scale-105 hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:border-slate-600 dark:focus:ring-slate-400 dark:disabled:bg-slate-800"
      >
        Sign in with SAML/OIDC
      </button>
    </div>
  );
}
