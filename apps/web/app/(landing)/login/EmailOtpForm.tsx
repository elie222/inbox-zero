"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { emailOtp, signIn } from "@/utils/auth-client";
import { redirectToSafeUrl } from "@/utils/redirect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EmailOtpForm({ callbackURL }: { callbackURL: string }) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    resetField,
    formState: { isSubmitting },
  } = useForm({ defaultValues: { email: "", code: "" } });

  const submit = handleSubmit(async ({ email, code }) => {
    setError(null);
    try {
      if (!sentTo) {
        const address = email.trim().toLowerCase();
        const result = await emailOtp.sendVerificationOtp({
          email: address,
          type: "sign-in",
        });
        if (result.error) {
          setError(
            "Could not send a code. Please wait a minute and try again.",
          );
          return;
        }
        setSentTo(address);
      } else {
        const result = await signIn.emailOtp({
          email: sentTo,
          otp: code.trim(),
        });
        if (result.error) {
          setError(
            "Invalid or expired code. Check the code or request a new one.",
          );
          return;
        }
        redirectToSafeUrl(callbackURL);
      }
    } catch {
      setError("Unable to sign in. Please try again.");
    }
  });

  return (
    <form className="space-y-4 pt-3" onSubmit={submit}>
      {sentTo ? (
        <>
          <p className="text-sm text-muted-foreground">
            Check your email for a code. It expires in 5 minutes.
          </p>
          <Label htmlFor="login-code">Sign-in code</Label>
          <Input
            id="login-code"
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            {...register("code")}
          />
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Enable email code sign-in in Settings first.
          </p>
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            {...register("email")}
          />
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button className="w-full" type="submit" loading={isSubmitting}>
        {sentTo ? "Verify code and sign in" : "Send sign-in code"}
      </Button>
      {sentTo && (
        <Button
          className="w-full"
          type="button"
          variant="ghost"
          disabled={isSubmitting}
          onClick={() => {
            setSentTo(null);
            setError(null);
            resetField("code");
          }}
        >
          Back to email
        </Button>
      )}
    </form>
  );
}
