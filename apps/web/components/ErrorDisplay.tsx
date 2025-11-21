"use client";

import Image from "next/image";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { logOut } from "@/utils/user";
import { env } from "@/env";

// TODO would be better to have a consistent definition here. didn't want to break things.
export function ErrorDisplay(props: {
  error: { info?: { error: string | object }; error?: string | object };
}) {
  const errorMessage =
    safeErrorToString(props.error?.info?.error) ||
    safeErrorToString(props.error?.error);

  if (errorMessage) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-destructive/10">
            <AlertCircle className="text-destructive" />
          </EmptyMedia>
          <EmptyTitle>There was an error</EmptyTitle>
          <EmptyDescription>{errorMessage}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (props.error) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-destructive/10">
            <AlertCircle className="text-destructive" />
          </EmptyMedia>
          <EmptyTitle>There was an error</EmptyTitle>
          <EmptyDescription>
            Please refresh or contact support at{" "}
            <a href={`mailto:${env.NEXT_PUBLIC_SUPPORT_EMAIL}`}>
              {env.NEXT_PUBLIC_SUPPORT_EMAIL}
            </a>{" "}
            if the error persists.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return null;
}

export const NotLoggedIn = () => {
  return (
    <div className="flex flex-col items-center justify-center sm:p-20 md:p-32">
      <div className="text-lg text-gray-700">You are not signed in 😞</div>
      <Button
        variant="outline"
        className="mt-2"
        onClick={() => logOut("/login")}
      >
        Sign in
      </Button>
      <div className="mt-8">
        <Image
          src="/images/illustrations/falling.svg"
          alt=""
          width={400}
          height={400}
          unoptimized
          className="dark:brightness-90 dark:invert"
        />
      </div>
    </div>
  );
};

const safeErrorToString = (
  error: string | object | undefined,
): string | null => {
  if (!error) return null;
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    // Handle Zod validation errors with issues array
    if ("issues" in error && Array.isArray(error.issues)) {
      return error.issues
        .map((issue) => issue.message || "Validation error")
        .join(", ");
    }
    // For other objects, try to stringify safely
    try {
      return JSON.stringify(error);
    } catch {
      return "Invalid data format";
    }
  }
  return String(error);
};
