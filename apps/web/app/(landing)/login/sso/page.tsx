"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { useRouter } from "next/navigation";
import type {
  GetSsoSignInParams,
  GetSsoSignInResponse,
} from "@/app/api/sso/signin/route";

const ssoLoginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  organizationSlug: z
    .string()
    .regex(
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
      "Please enter a valid organization slug",
    )
    .max(63, "Organization slug must be 63 characters or fewer"),
});

type SsoLoginBody = z.infer<typeof ssoLoginSchema>;

export default function SSOLoginPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SsoLoginBody>({
    resolver: zodResolver(ssoLoginSchema),
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit: SubmitHandler<SsoLoginBody> = useCallback(
    async (data) => {
      setIsSubmitting(true);
      try {
        const params: GetSsoSignInParams = {
          email: data.email,
          organizationSlug: data.organizationSlug,
        };

        const paramsString = new URLSearchParams(params).toString();
        const url = new URL(
          `/api/sso/signin?${paramsString}`,
          window.location.origin,
        );

        const response = await fetch(url.toString());
        const responseData = await response.json();

        if (!response.ok) {
          toastError({
            title: "SSO Sign-in Error",
            description: responseData.error || "Failed to initiate SSO sign-in",
          });
          return;
        }

        const res: GetSsoSignInResponse = responseData;

        if (res.redirectUrl) {
          toastSuccess({ description: "Redirecting to SSO provider..." });
          router.push(res.redirectUrl);
        }
      } catch {
        toastError({
          title: "SSO Sign-in Error",
          description: "An unexpected error occurred. Please try again.",
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [router],
  );

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
                registerProps={register("email")}
                error={errors.email}
              />

              <Input
                type="text"
                name="organizationSlug"
                label="Organization Slug"
                placeholder="your-org-slug"
                registerProps={register("organizationSlug")}
                error={errors.organizationSlug}
              />

              <Button type="submit" size="lg" full loading={isSubmitting}>
                Continue with SSO
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
