"use client";

import { zodResolver } from "@hookform/resolvers/zod";

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            Enterprise SSO Login
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in to your organization account
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4">
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
          </div>

          <div>
            <Button type="submit" size="lg" full loading={isSubmitting}>
              Continue with SSO
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
