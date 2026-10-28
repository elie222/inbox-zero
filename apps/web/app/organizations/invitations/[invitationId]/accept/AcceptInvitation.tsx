"use client";

import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { useEffect, useRef } from "react";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { handleInvitationAction } from "@/utils/actions/organization";
import { WELCOME_PATH } from "@/utils/config";
import { getActionErrorMessage } from "@/utils/error";

export function AcceptInvitation({ invitationId }: { invitationId: string }) {
  const { execute, result, hasErrored, hasSucceeded } = useAction(
    handleInvitationAction,
  );
  const hasExecuted = useRef(false);

  useEffect(() => {
    // Accepting is not idempotent, so a Strict Mode re-run must not repeat it.
    if (hasExecuted.current) return;
    hasExecuted.current = true;
    execute({ invitationId });
  }, [execute, invitationId]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <LoadingContent
          loading={!hasSucceeded && !hasErrored}
          error={
            hasErrored
              ? {
                  error: getActionErrorMessage(result, {
                    fallback: "Failed to accept the invitation",
                  }),
                }
              : undefined
          }
        >
          <CardHeader>
            <CardTitle>Welcome!</CardTitle>
            <CardDescription>
              You're now part of the organization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href={WELCOME_PATH}>Continue</Link>
            </Button>
          </CardContent>
        </LoadingContent>
      </Card>
    </div>
  );
}
