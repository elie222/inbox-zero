"use client";

import { useState } from "react";
import { useOrganizationMembers } from "@/hooks/useOrganizationMembers";
import { LoadingContent } from "@/components/LoadingContent";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserPlusIcon, TrashIcon } from "lucide-react";
import { InviteMemberModal } from "@/components/InviteMemberModal";
import { removeMemberAction } from "@/utils/actions/remove-member";
import { toastSuccess, toastError } from "@/components/Toast";

export default function MembersPage() {
  const { data, isLoading, error, mutate } = useOrganizationMembers();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  const handleRemoveMember = async (memberId: string) => {
    try {
      const result = await removeMemberAction({ memberId });

      if (result?.serverError) {
        toastError({
          title: "Error removing member",
          description: result.serverError,
        });
      } else {
        toastSuccess({ description: "Member removed successfully" });
        mutate(); // Refresh the members list
      }
    } catch (err) {
      toastError({
        title: "Error removing member",
        description:
          err instanceof Error ? err.message : "Failed to remove member",
      });
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Organization Members</h1>
          <p className="text-muted-foreground">
            Manage your organization members and invite new team members.
          </p>
        </div>

        <LoadingContent loading={isLoading} error={error}>
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">
                Members ({data?.members.length || 0})
              </h2>
              <Button onClick={() => setIsInviteModalOpen(true)}>
                <UserPlusIcon className="mr-2 size-4" />
                Invite Member
              </Button>
            </div>

            <div className="space-y-4">
              {data?.members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center space-x-4">
                    <Avatar className="h-10 w-10">
                      <AvatarImage
                        src={member.user.image || ""}
                        alt={member.user.name || member.user.email}
                      />
                      <AvatarFallback>
                        {member.user.name
                          ? member.user.name.charAt(0).toUpperCase()
                          : member.user.email.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <p className="font-medium">
                          {member.user.name || "No name"}
                        </p>
                        <Badge
                          variant={
                            member.role === "admin" ? "default" : "secondary"
                          }
                        >
                          {member.role.charAt(0).toUpperCase() +
                            member.role.slice(1)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {member.user.email}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Joined {new Date(member.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveMember(member.id)}
                    >
                      <TrashIcon className="mr-2 size-4" />
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {data?.members.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  No members found in your organization.
                </p>
              </div>
            )}
          </div>
        </LoadingContent>

        <InviteMemberModal
          open={isInviteModalOpen}
          onOpenChange={setIsInviteModalOpen}
          onSuccess={() => mutate()}
        />
      </div>
    </div>
  );
}
