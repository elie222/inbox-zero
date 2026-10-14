"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AlertError } from "@/components/Alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/utils/auth-client";
import { redirectToSafeUrl } from "@/utils/redirect";

const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password").max(128),
});

export function LocalPasswordForm({ callbackURL }: { callbackURL: string }) {
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof credentialsSchema>>({
    resolver: zodResolver(credentialsSchema),
  });

  return (
    <form
      className="mb-6 flex flex-col gap-4 px-4"
      onSubmit={handleSubmit(async (values) => {
        setError(null);
        try {
          const result = await signIn.email({ ...values, callbackURL });
          if (result.error) {
            setError("Check your email and password, then try again.");
            return;
          }
          redirectToSafeUrl(callbackURL);
        } catch {
          setError("Could not sign in. Please try again.");
        }
      })}
    >
      {error && <AlertError title="Could not sign in" description={error} />}
      <div className="grid gap-2">
        <Label htmlFor="local-email">Email</Label>
        <Input
          id="local-email"
          type="email"
          autoComplete="username"
          {...register("email")}
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="local-password">Password</Label>
        <Input
          id="local-password"
          type="password"
          autoComplete="current-password"
          {...register("password")}
        />
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        )}
      </div>
      <Button type="submit" loading={isSubmitting}>
        Sign in locally
      </Button>
      <Link
        href="/settings#local-account-title"
        className="text-center text-sm text-muted-foreground underline"
      >
        Manage local account after signing in
      </Link>
    </form>
  );
}
