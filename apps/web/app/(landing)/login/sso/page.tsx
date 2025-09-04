"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useCallback, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";

const ssoLoginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  organizationSlug: z.string().min(1, "Organization slug is required"),
});

type SsoLoginBody = z.infer<typeof ssoLoginSchema>;

export default function SSOLoginPage() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SsoLoginBody>({
    resolver: zodResolver(ssoLoginSchema),
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit: SubmitHandler<SsoLoginBody> = useCallback(async (data) => {
    setIsSubmitting(true);
    try {
      const url = new URL("/api/sso/signin", window.location.origin);
      url.searchParams.set("email", data.email);
      url.searchParams.set("organizationSlug", data.organizationSlug);

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
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return (
    <div className="flex h-screen flex-col justify-center text-foreground">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
        <div className="flex flex-col text-center">
          <h1 className="font-cal text-2xl text-foreground">SSO Sign In</h1>
          <p className="mt-4 text-muted-foreground">
            Sign in to your organization account
          </p>
        </div>

        <div className="mt-4">
          <div className="space-y-4">
            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
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
                name="organizationSlug"
                label="Organization Slug"
                placeholder="your-org-slug — lowercase, hyphens only"
                registerProps={register("organizationSlug")}
                error={errors.organizationSlug}
              />

              <Button type="submit" size="lg" full loading={isSubmitting}>
                Continue with SSO
              </Button>
            </form>
          </div>
        </div>

        <p className="px-8 pt-10 text-center text-sm text-muted-foreground">
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
        </p>

        <p className="px-4 pt-4 text-center text-sm text-muted-foreground">
          Inbox Zero{"'"}s use and transfer of information received from Google
          APIs to any other app will adhere to{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Google API Services User Data
          </a>{" "}
          Policy, including the Limited Use requirements.
        </p>
      </div>
    </div>
  );
}
