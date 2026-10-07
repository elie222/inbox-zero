"use client";

import { usePathname } from "next/navigation";
import { useQueryState } from "nuqs";
import useSWR from "swr";
import { TabSelect } from "@/components/TabSelect";
import { PageHeading } from "@/components/Typography";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TeamConversationsResponse } from "@/app/api/team-comments/conversations/route";

export function useSharedMemberId() {
  const [memberIdParam, setMemberId] = useQueryState("memberId");
  const memberships = useSWR<TeamConversationsResponse>(
    "/api/team-comments/conversations",
  );
  const options = memberships.data?.memberships ?? [];
  const memberId =
    options.find(({ id }) => id === memberIdParam)?.id ??
    options[0]?.id ??
    null;
  return { memberId, setMemberId, memberships, options };
}

export function SharedTabs() {
  const pathname = usePathname();
  const { memberId, setMemberId, options } = useSharedMemberId();
  const query = memberId ? `?memberId=${encodeURIComponent(memberId)}` : "";

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <PageHeading>Shared with me</PageHeading>
        {options.length > 1 && memberId && (
          <Select value={memberId} onValueChange={setMemberId}>
            <SelectTrigger className="w-auto min-w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {options.map((membership) => (
                <SelectItem key={membership.id} value={membership.id}>
                  {membership.organization.name} ·{" "}
                  {membership.emailAccount.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="border-b border-neutral-200">
        <TabSelect
          options={[
            {
              id: "conversations",
              label: "Conversations",
              href: `/shared${query}`,
            },
            {
              id: "activity",
              label: "Activity",
              href: `/shared/activity${query}`,
            },
          ]}
          selected={
            pathname.endsWith("/activity") ? "activity" : "conversations"
          }
        />
      </div>
    </div>
  );
}

export function NoOrganization() {
  return (
    <p className="text-muted-foreground text-sm">
      Join an organization to see conversations your teammates share with you.
    </p>
  );
}
