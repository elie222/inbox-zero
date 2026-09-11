"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns/formatDistanceToNow";
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSeparator,
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
  ShieldIcon,
  XIcon,
  CrownIcon,
} from "lucide-react";
import { InviteMemberModal } from "@/components/InviteMemberModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  cancelInvitationAction,
  removeMemberAction,
  transferOwnershipAction,
  updateMemberRoleAction,
} from "@/utils/actions/organization";
import { toastSuccess, toastError } from "@/components/Toast";
import type { OrganizationMembersResponse } from "@/app/api/organizations/[organizationId]/members/route";
import { useExecutedRulesCount } from "@/hooks/useExecutedRulesCount";
import { TypographyH3 } from "@/components/Typography";
import { useOrganizationMembership } from "@/hooks/useOrganizationMembership";
import { hasOrganizationAdminRole } from "@/utils/organizations/roles";
import {
  RECENT_ACTIVITY_HOURS,
  getMemberActivityStatus,
  type MemberActivityStatus,
} from "./member-activity";

type Member = OrganizationMembersResponse["members"][0];
type PendingInvitation = OrganizationMembersResponse["pendingInvitations"][0];

export function Members({ organizationId }: { organizationId: string }) {
  const { data, isLoading, error, mutate } =
    useOrganizationMembers(organizationId);
  const { data: membership } = useOrganizationMembership();
  const isAdmin = hasOrganizationAdminRole(membership?.role ?? "");
  const isOwner = membership?.role === "owner";
  const { data: executedRulesData } = useExecutedRulesCount(
    isAdmin ? organizationId : null,
  );
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);

  // Create a Map for O(1) lookups instead of O(n) Array.find for each member
  const executedRulesStatsMap = useMemo(() => {
    if (!executedRulesData?.memberCounts) return new Map();

    return new Map(
      executedRulesData.memberCounts.map((item) => [
        item.emailAccountId,
        {
          executedRulesCount: item.executedRulesCount,
          lastProcessedEmailAt: item.lastProcessedEmailAt,
        },
      ]),
    );
  }, [executedRulesData?.memberCounts]);

  const handleAction = useCallback(
    async (
      memberId: string | null,
      action: () => Promise<{ serverError?: string } | undefined>,
      errorTitle: string,
      successMessage: string,
      errorMessage: string,
    ) => {
      setPendingMemberId(memberId);

      try {
        const result = await action();

        if (result?.serverError) {
          toastError({
            title: errorTitle,
            description: result.serverError,
          });
        } else {
          toastSuccess({ description: successMessage });
          await mutate();
        }
      } catch (err) {
        toastError({
          title: errorTitle,
          description: err instanceof Error ? err.message : errorMessage,
        });
      } finally {
        setPendingMemberId(null);
      }
    },
    [mutate],
  );

  const handleRemoveMember = useCallback(
    (memberId: string) =>
      handleAction(
        memberId,
        () => removeMemberAction({ memberId }),
        "Error removing member",
        "Member removed successfully",
        "Failed to remove member",
      ),
    [handleAction],
  );

  const handleCancelInvitation = useCallback(
    (invitationId: string) =>
      handleAction(
        null,
        () => cancelInvitationAction({ invitationId }),
        "Error cancelling invitation",
        "Invitation cancelled successfully",
        "Failed to cancel invitation",
      ),
    [handleAction],
  );

  const handleUpdateRole = useCallback(
    (memberId: string, role: "admin" | "member") =>
      handleAction(
        memberId,
        () => updateMemberRoleAction({ memberId, role }),
        "Error updating role",
        `Role updated to ${capitalizeRole(role)}`,
        "Failed to update role",
      ),
    [handleAction],
  );

  const handleTransferOwnership = useCallback(
    (memberId: string) =>
      handleAction(
        memberId,
        () => transferOwnershipAction({ organizationId, memberId }),
        "Error transferring ownership",
        "Ownership transferred successfully",
        "Failed to transfer ownership",
      ),
    [handleAction, organizationId],
  );

  return (
    <LoadingContent loading={isLoading} error={error}>
      <div>
        <div className="flex justify-between items-center">
          <TypographyH3>Members ({data?.members.length || 0})</TypographyH3>
          {isAdmin && (
            <InviteMemberModal
              organizationId={organizationId}
              onSuccess={mutate}
            />
          )}
        </div>

        <div className="space-y-2 mt-4">
          {data?.members.map((member) => {
            const executedRulesStats = executedRulesStatsMap.get(
              member.emailAccount.id,
            );

            return (
              <MemberCard
                key={member.id}
                member={member}
                onRemove={handleRemoveMember}
                onUpdateRole={handleUpdateRole}
                onTransferOwnership={handleTransferOwnership}
                executedRulesCount={executedRulesStats?.executedRulesCount}
                lastProcessedEmailAt={
                  executedRulesStats?.lastProcessedEmailAt ?? null
                }
                isAdmin={isAdmin}
                isOwner={isOwner}
                isPending={pendingMemberId === member.id}
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
            <div className="space-y-2">
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
  onUpdateRole,
  onTransferOwnership,
  executedRulesCount,
  lastProcessedEmailAt,
  isAdmin,
  isOwner,
  isPending,
}: {
  member: Member;
  onRemove: (memberId: string) => void;
  onUpdateRole: (memberId: string, role: "admin" | "member") => void;
  onTransferOwnership: (memberId: string) => void;
  executedRulesCount?: number;
  lastProcessedEmailAt?: Date | string | null;
  isAdmin: boolean;
  isOwner: boolean;
  isPending: boolean;
}) {
  const { emailAccountId } = useAccount();
  const canChangeRole = member.role !== "owner";
  const canTransferOwnership = isOwner && canChangeRole;
  const activityStatus = getMemberActivityStatus({
    allowOrgAdminAnalytics: member.allowOrgAdminAnalytics,
    disconnectedAt: member.emailAccount.disconnectedAt,
    lastProcessedEmailAt,
  });

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
        isAdmin &&
        member.emailAccount.id !== emailAccountId &&
        member.emailAccount.id && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={isPending}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {member.allowOrgAdminAnalytics && (
                <>
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
                </>
              )}
              {canChangeRole && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger disabled={isPending}>
                    <ShieldIcon className="mr-2 size-4" />
                    Role
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      value={member.role}
                      onValueChange={(value) => {
                        if (value === member.role) return;
                        onUpdateRole(member.id, value as "admin" | "member");
                      }}
                    >
                      <DropdownMenuRadioItem
                        value="member"
                        disabled={isPending}
                      >
                        Member
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="admin" disabled={isPending}>
                        Admin
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {canTransferOwnership && (
                <ConfirmDialog
                  trigger={
                    <DropdownMenuItem
                      onSelect={(e: Event) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      disabled={isPending}
                    >
                      <CrownIcon className="mr-2 size-4" />
                      Transfer ownership
                    </DropdownMenuItem>
                  }
                  title="Transfer ownership"
                  description={`Transfer organization ownership to ${member.emailAccount.name || member.emailAccount.email}? You will become an admin.`}
                  confirmText="Transfer"
                  onConfirm={() => onTransferOwnership(member.id)}
                />
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onRemove(member.id)}
                className="text-red-600 hover:!bg-red-50 hover:!text-red-600"
              >
                <TrashIcon className="mr-2 size-4" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{member.emailAccount.name || "No name"}</p>
        <Badge
          variant={
            hasOrganizationAdminRole(member.role) ? "default" : "secondary"
          }
          className="text-xs"
        >
          {capitalizeRole(member.role)}
        </Badge>
        {isAdmin && (
          <MemberActivityBadge
            status={activityStatus}
            disconnectedAt={member.emailAccount.disconnectedAt}
            lastProcessedEmailAt={lastProcessedEmailAt}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
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

function MemberActivityBadge({
  disconnectedAt,
  lastProcessedEmailAt,
  status,
}: {
  disconnectedAt?: Date | string | null;
  lastProcessedEmailAt?: Date | string | null;
  status: MemberActivityStatus;
}) {
  const display = ACTIVITY_BADGE[status];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={display.variant} className="text-xs">
            {display.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{display.tooltip({ disconnectedAt, lastProcessedEmailAt })}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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

const ACTIVITY_BADGE: Record<
  MemberActivityStatus,
  {
    label: string;
    variant: "green" | "red" | "outline" | "secondary";
    tooltip: (dates: {
      disconnectedAt?: Date | string | null;
      lastProcessedEmailAt?: Date | string | null;
    }) => string;
  }
> = {
  active: {
    label: "Active",
    variant: "green",
    tooltip: ({ lastProcessedEmailAt }) =>
      `Last processed email ${formatRelativeDate(lastProcessedEmailAt)}.`,
  },
  disconnected: {
    label: "Disconnected",
    variant: "red",
    tooltip: ({ disconnectedAt }) =>
      disconnectedAt
        ? `Email account disconnected ${formatRelativeDate(disconnectedAt)}.`
        : "Email account is disconnected.",
  },
  hidden: {
    label: "Activity hidden",
    variant: "outline",
    tooltip: () => "This member has not allowed org admin analytics.",
  },
  inactive: {
    label: `No activity in ${RECENT_ACTIVITY_HOURS}h`,
    variant: "secondary",
    tooltip: ({ lastProcessedEmailAt }) =>
      `Last processed email ${formatRelativeDate(lastProcessedEmailAt)}.`,
  },
  none: {
    label: "No activity yet",
    variant: "secondary",
    tooltip: () => "No assistant-processed email found for this account.",
  },
};

function formatRelativeDate(date: Date | string | null | undefined) {
  if (!date) return "unknown";

  return formatDistanceToNow(new Date(date), { addSuffix: true });
}
