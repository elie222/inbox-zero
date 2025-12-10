"use client";

import { usePathname } from "next/navigation";
import { TabSelect } from "@/components/TabSelect";
import { PageHeading } from "@/components/Typography";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganization } from "@/hooks/useOrganization";

interface OrganizationTabsProps {
  organizationId: string;
}

export function OrganizationTabs({ organizationId }: OrganizationTabsProps) {
  const pathname = usePathname();
  const {
    data: organization,
    isLoading,
    error,
  } = useOrganization(organizationId);

  const tabs = [
    {
      id: "members",
      label: "Members",
      href: `/organization/${organizationId}`,
    },
    {
      id: "stats",
      label: "Analytics",
      href: `/organization/${organizationId}/stats`,
    },
  ];

  // Determine selected tab based on pathname
  const selected = pathname.includes("/stats") ? "stats" : "members";

  return (
    <div>
      <LoadingContent
        loading={isLoading}
        error={error}
        loadingComponent={<Skeleton className="mb-2 h-8 w-48" />}
      >
        {organization?.name && (
          <PageHeading className="mb-2">{organization.name}</PageHeading>
        )}
      </LoadingContent>
      <div className="border-b border-neutral-200">
        <TabSelect options={tabs} selected={selected} />
      </div>
    </div>
  );
}
