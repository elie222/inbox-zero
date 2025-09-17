"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useOrganizationMembers } from "@/hooks/useOrganizationMembers";
import { LoadingContent } from "@/components/LoadingContent";
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
} from "lucide-react";
import { InviteMemberModal } from "@/components/InviteMemberModal";
import { removeMemberAction } from "@/utils/actions/remove-member";
import { toastSuccess, toastError } from "@/components/Toast";
import type { OrganizationMembersResponse } from "@/app/api/organizations/members/route";
import { useExecutedRulesCount } from "@/hooks/useExecutedRulesCount";

type Member = OrganizationMembersResponse["members"][0];

interface MemberCardProps {
  member: Member;
  onRemove: (memberId: string) => void;
  executedRulesCount?: number;
}

function MemberCard({ member, onRemove, executedRulesCount }: MemberCardProps) {
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div className="flex items-center space-x-4 flex-1 min-w-0">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className="h-10 w-10 flex-shrink-0">
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
            </TooltipTrigger>
            <TooltipContent>
              <p>
                Joined at: {new Date(member.createdAt).toLocaleDateString()}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-3">
            <p className="font-medium">{member.user.name || "No name"}</p>
            <Badge
              variant={member.role === "admin" ? "default" : "secondary"}
              className="text-xs"
            >
              {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
            </Badge>
          </div>
          <div className="flex items-center space-x-3 mt-1">
            <span className="text-xs text-muted-foreground">
              {member.user.email}
            </span>
            {executedRulesCount !== undefined && (
              <>
                <span className="text-xs text-muted-foreground">∣</span>
                <span className="text-xs text-muted-foreground">
                  {executedRulesCount} executed rules
                </span>
              </>
            )}
          </div>
        </div>
      </div>
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
          {member.user.emailAccounts?.[0]?.id ? (
            <DropdownMenuItem asChild>
              <Link href={`/${member.user.emailAccounts[0].id}/stats`}>
                <BarChart3 className="mr-2 size-4" />
                Analytics
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled>
              <BarChart3 className="mr-2 size-4" />
              Analytics
            </DropdownMenuItem>
          )}
          <DropdownMenuItem>
            <BarChartIcon className="mr-2 size-4" />
            Usage
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function MembersPage() {
  const { data, isLoading, error, mutate } = useOrganizationMembers();
  const { data: executedRulesData } = useExecutedRulesCount();

  const handleRemoveMember = useCallback(
    (memberId: string) => {
      return async () => {
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
    },
    [mutate],
  );

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
              <InviteMemberModal />
            </div>

            <div className="space-y-4">
              {data?.members.map((member) => {
                const executedRulesCount =
                  executedRulesData?.executedRulesCount.find(
                    (item) => item.userId === member.user.id,
                  )?.executedRulesCount;

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

            {data?.members.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  No members found in your organization.
                </p>
              </div>
            )}
          </div>
        </LoadingContent>
      </div>
    </div>
  );
}
