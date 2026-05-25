"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LogInIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AlertError } from "@/components/Alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WELCOME_PATH } from "@/utils/config";
import { normalizeInternalPath } from "@/utils/path";
import { redirectToSafeUrl } from "@/utils/redirect";

const appReviewSignInBody = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().trim().min(1, "Password is required").max(128),
});

type AppReviewSignInBody = z.infer<typeof appReviewSignInBody>;

export function ReviewSignInForm() {
  const searchParams = useSearchParams();
  const nextPath = normalizeInternalPath(searchParams?.get("next"));
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AppReviewSignInBody>({
    resolver: zodResolver(appReviewSignInBody),
  });

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(handleSignIn)}>
      {error ? (
        <AlertError title="Could not sign in" description={error} />
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="review-email">Email</Label>
        <Input
          id="review-email"
          autoComplete="username"
          inputMode="email"
          placeholder="reviewer@example.com"
          type="email"
          {...register("email")}
        />
        {errors.email?.message ? (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="review-password">Password</Label>
        <Input
          id="review-password"
          autoComplete="current-password"
          type="password"
          {...register("password")}
        />
        {errors.password?.message ? (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        ) : null}
      </div>

      <Button
        className="mt-2 w-full"
        Icon={LogInIcon}
        loading={isSubmitting}
        type="submit"
      >
        Sign in
      </Button>
    </form>
  );

  async function handleSignIn(values: AppReviewSignInBody) {
    setError(null);

    try {
      const response = await fetch("/api/mobile-review/sign-in", {
        body: JSON.stringify({ code: values.password, email: values.email }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        setError(await getErrorMessage(response));
        return;
      }

      redirectToSafeUrl(nextPath ?? WELCOME_PATH);
    } catch {
      setError("Please try again or contact support.");
    }
  }
}

async function getErrorMessage(response: Response) {
  const body = await response.json().catch(() => null);
  if (isErrorResponse(body)) return body.error;

  if (response.status === 401) {
    return "Check the email and password, then try again.";
  }

  return "Review access is unavailable. Please contact support.";
}

function isErrorResponse(body: unknown): body is { error: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  );
}
