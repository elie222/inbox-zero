"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useOrganizationMembers } from "@/hooks/useOrganizationMembers";
import { LoadingContent } from "@/components/LoadingContent";
import { useAccount } from "@/providers/EmailAccountProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TrashIcon,
  MoreHorizontal,
  BarChart3,
  BarChartIcon,
  XIcon,
  PieChartIcon,
} from "lucide-react";
import { InviteMemberModal } from "@/components/InviteMemberModal";
import {
  cancelInvitationAction,
  removeMemberAction,
} from "@/utils/actions/organization";
import { toastSuccess, toastError } from "@/components/Toast";
import type { OrganizationMembersResponse } from "@/app/api/organizations/[organizationId]/members/route";
import { useExecutedRulesCount } from "@/hooks/useExecutedRulesCount";
import { TypographyH3 } from "@/components/Typography";

type Member = OrganizationMembersResponse["members"][0];
type PendingInvitation = OrganizationMembersResponse["pendingInvitations"][0];

export function Members({ organizationId }: { organizationId: string }) {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } =
    useOrganizationMembers(organizationId);
  const { data: executedRulesData } = useExecutedRulesCount(organizationId);

  // Create a Map for O(1) lookups instead of O(n) Array.find for each member
  const executedRulesCountMap = useMemo(() => {
    if (!executedRulesData?.memberCounts) return new Map();

    return new Map(
      executedRulesData.memberCounts.map((item) => [
        item.emailAccountId,
        item.executedRulesCount,
      ]),
    );
  }, [executedRulesData?.memberCounts]);

  const handleAction = useCallback(
    async (
      action: () => Promise<{ serverError?: string } | undefined>,
      errorTitle: string,
      successMessage: string,
      errorMessage: string,
    ) => {
      try {
        const result = await action();

        if (result?.serverError) {
          toastError({
            title: errorTitle,
            description: result.serverError,
          });
        } else {
          toastSuccess({ description: successMessage });
          mutate();
        }
      } catch (err) {
        toastError({
          title: errorTitle,
          description: err instanceof Error ? err.message : errorMessage,
        });
      }
    },
    [mutate],
  );

  const handleRemoveMember = useCallback(
    (memberId: string) =>
      handleAction(
        () => removeMemberAction(emailAccountId, { memberId }),
        "Error removing member",
        "Member removed successfully",
        "Failed to remove member",
      ),
    [handleAction, emailAccountId],
  );

  const handleCancelInvitation = useCallback(
    (invitationId: string) =>
      handleAction(
        () => cancelInvitationAction({ invitationId }),
        "Error cancelling invitation",
        "Invitation cancelled successfully",
        "Failed to cancel invitation",
      ),
    [handleAction],
  );

  return (
    <LoadingContent loading={isLoading} error={error}>
      <div>
        <div className="flex justify-between items-center">
          <TypographyH3>Members ({data?.members.length || 0})</TypographyH3>
          <InviteMemberModal
            organizationId={organizationId}
            onSuccess={mutate}
          />
        </div>

        <div className="space-y-4 mt-4">
          {data?.members.map((member) => {
            const executedRulesCount = executedRulesCountMap.get(
              member.emailAccount.id,
            );

            return (
              <MemberCard
                key={member.id}
                member={member}
                onRemove={handleRemoveMember}
                executedRulesCount={executedRulesCount}
              />
            );
          })}
        </div>

        {data?.members.length === 0 &&
          (!data?.pendingInvitations ||
            data.pendingInvitations.length === 0) && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No members found in your organization.
              </p>
            </div>
          )}

        {data?.pendingInvitations && data.pendingInvitations.length > 0 && (
          <div className="space-y-4 mt-8">
            <TypographyH3>
              Pending Invitations ({data.pendingInvitations.length})
            </TypographyH3>
            <div className="space-y-4">
              {data.pendingInvitations.map((invitation) => (
                <PendingInvitationCard
                  key={invitation.id}
                  invitation={invitation}
                  onCancel={handleCancelInvitation}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </LoadingContent>
  );
}

function CardWrapper({
  avatar,
  children,
  actions,
}: {
  avatar: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div className="flex items-center space-x-4 flex-1 min-w-0">
        {avatar}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
      {actions}
    </div>
  );
}

function MemberCard({
  member,
  onRemove,
  executedRulesCount,
}: {
  member: Member;
  onRemove: (memberId: string) => void;
  executedRulesCount?: number;
}) {
  const { emailAccountId } = useAccount();

  return (
    <CardWrapper
      avatar={
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className="h-10 w-10 flex-shrink-0">
                <AvatarImage
                  src={member.emailAccount.image || ""}
                  alt={member.emailAccount.name || member.emailAccount.email}
                />
                <AvatarFallback>
                  {getInitials(
                    member.emailAccount.name,
                    member.emailAccount.email,
                  )}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                Joined at: {new Date(member.createdAt).toLocaleDateString()}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      }
      actions={
        member.emailAccount.id !== emailAccountId &&
        member.emailAccount.id && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onRemove(member.id)}>
                <TrashIcon className="mr-2 size-4" />
                Remove
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/${member.emailAccount.id}/stats`}>
                  <BarChart3 className="mr-2 size-4" />
                  Analytics
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/${member.emailAccount.id}/usage`}>
                  <BarChartIcon className="mr-2 size-4" />
                  Usage
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
    >
      <div className="flex items-center space-x-3">
        <p className="font-medium">{member.emailAccount.name || "No name"}</p>
        <Badge
          variant={member.role === "admin" ? "default" : "secondary"}
          className="text-xs"
        >
          {capitalizeRole(member.role)}
        </Badge>
      </div>
      <div className="flex items-center space-x-3 mt-1">
        <span className="text-xs text-muted-foreground">
          {member.emailAccount.email}
        </span>
        {executedRulesCount !== undefined && (
          <>
            <span className="text-xs text-muted-foreground">∣</span>
            <span className="text-xs text-muted-foreground">
              {executedRulesCount.toLocaleString()} assistant processed emails
            </span>
          </>
        )}
      </div>
    </CardWrapper>
  );
}

function PendingInvitationCard({
  invitation,
  onCancel,
}: {
  invitation: PendingInvitation;
  onCancel: (invitationId: string) => void;
}) {
  return (
    <CardWrapper
      avatar={
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className="h-10 w-10 flex-shrink-0">
                <AvatarFallback>
                  {invitation.email.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                Expires at:{" "}
                {new Date(invitation.expiresAt).toLocaleDateString()}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      }
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCancel(invitation.id)}
        >
          <XIcon className="size-4 mr-2" />
          Cancel
        </Button>
      }
    >
      <div className="flex items-center space-x-3">
        <p className="font-medium">{invitation.email}</p>
        <Badge variant="outline" className="text-xs">
          Pending
        </Badge>
        {invitation.role && (
          <Badge variant="secondary" className="text-xs">
            {capitalizeRole(invitation.role)}
          </Badge>
        )}
      </div>
      <div className="flex items-center space-x-3 mt-1">
        <span className="text-xs text-muted-foreground">
          Invited by {invitation.inviter.name || invitation.inviter.email}
        </span>
      </div>
    </CardWrapper>
  );
}

function capitalizeRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function getInitials(name: string | null | undefined, email: string) {
  return name ? name.charAt(0).toUpperCase() : email.charAt(0).toUpperCase();
}
