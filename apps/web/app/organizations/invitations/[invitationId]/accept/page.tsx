"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loading } from "@/components/Loading";
import { useUser } from "@/hooks/useUser";
import { handleInvitationAction } from "@/utils/actions/organization";
import { setInvitationCookie, clearInvitationCookie } from "@/utils/cookies";

export default function AcceptInvitationPage() {
  const params = useParams();
  const router = useRouter();
  const { data: user, isLoading: userLoading, mutate } = useUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [hasProcessed, setHasProcessed] = useState(false);

  const invitationId = params.invitationId;

  useEffect(() => {
    mutate();
  }, [mutate]);

  useEffect(() => {
    const handleInvitation = async () => {
      if (
        userLoading ||
        hasProcessed ||
        !invitationId ||
        Array.isArray(invitationId)
      )
        return;

      try {
        if (!user) {
          setHasProcessed(true);
          setInvitationCookie(invitationId);
          router.push(
            `/login?next=/organizations/invitations/${invitationId}/accept`,
          );
          return;
        }

        setHasProcessed(true);
        const result = await handleInvitationAction({ invitationId });

        if (result?.serverError) {
          setError(result.serverError);
        } else if (result?.validationErrors) {
          setError("Validation error occurred");
        } else if (result?.data) {
          clearInvitationCookie();
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

    if (invitationId) {
      handleInvitation();
    }
  }, [invitationId, user, userLoading, router, hasProcessed]);

  if (!invitationId || Array.isArray(invitationId)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid invitation</CardTitle>
            <CardDescription>
              The invitation link is invalid or missing.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (loading || userLoading) {
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
            <Button onClick={() => router.push("/welcome")} className="w-full">
              Continue
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
