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
import { Loader2 } from "lucide-react";
import { useUser } from "@/hooks/useUser";
import { handleInvitationAction } from "@/utils/actions/invitation";
import { mutate } from "swr";
import { setInvitationCookie, clearInvitationCookie } from "@/utils/cookies";

export default function AcceptInvitationPage() {
  const params = useParams();
  const router = useRouter();
  const { data: user, isLoading: userLoading } = useUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ organizationName: string } | null>(
    null,
  );
  const [hasProcessed, setHasProcessed] = useState(false);

  const invitationId = params.invitationId as string;

  // Revalidate user data to ensure we have fresh data
  useEffect(() => {
    mutate("/api/user/me");
  }, []);

  useEffect(() => {
    const handleInvitation = async () => {
      if (userLoading || hasProcessed) return;

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
          setSuccess({
            organizationName:
              result.data.organizationName || "the organization",
          });
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

  if (loading || userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
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
            <CardTitle>Invitation Error</CardTitle>
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
              You're now part of {success.organizationName}.
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
