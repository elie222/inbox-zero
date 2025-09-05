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

export default function AcceptInvitationPage() {
  const params = useParams();
  const router = useRouter();
  const { data: user, isLoading: userLoading } = useUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ organizationName: string } | null>(
    null,
  );

  const invitationId = params.invitationId as string;

  useEffect(() => {
    const handleInvitation = async () => {
      if (userLoading) return;

      try {
        if (!user) {
          document.cookie = `invitation_id=${invitationId}; path=/; max-age=${7 * 24 * 60 * 60}`;
          router.push(
            `/login?redirect=/organizations/invitations/${invitationId}/accept`,
          );
          return;
        }

        const result = await handleInvitationAction({ invitationId });

        if (result?.serverError) {
          setError(result.serverError);
        } else if (result?.validationErrors) {
          setError("Validation error occurred");
        } else if (result?.data) {
          document.cookie =
            "invitation_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
          setSuccess({
            organizationName:
              result.data.organizationName || "the organization",
          });
        } else {
          setError("An unknown error occurred.");
        }
      } catch (err) {
        console.error("Invitation error:", err);
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
  }, [invitationId, user, userLoading, router]);

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
