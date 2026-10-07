"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loading } from "@/components/Loading";
import { handleInvitationAction } from "@/utils/actions/organization";
import { WELCOME_PATH } from "@/utils/config";

export function AcceptInvitation({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const handleInvitation = async () => {
      try {
        const result = await handleInvitationAction({ invitationId });

        if (result?.serverError) {
          setError(result.serverError);
        } else if (result?.validationErrors) {
          setError("Validation error occurred");
        } else if (result?.data) {
          setSuccess(true);
        } else {
          setError("An unknown error occurred.");
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to process invitation",
        );
      } finally {
        setLoading(false);
      }
    };

    handleInvitation();
  }, [invitationId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="py-8">
            <Loading />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invitation error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Welcome!</CardTitle>
            <CardDescription>
              You're now part of the organization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => router.push(WELCOME_PATH)}
              className="w-full"
            >
              Continue
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
