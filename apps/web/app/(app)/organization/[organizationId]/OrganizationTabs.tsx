"use client";

import { usePathname } from "next/navigation";
import { TabSelect } from "@/components/TabSelect";
import { PageHeading } from "@/components/Typography";

interface OrganizationTabsProps {
  organizationId: string;
  organizationName?: string;
}

export function OrganizationTabs({
  organizationId,
  organizationName,
}: OrganizationTabsProps) {
  const pathname = usePathname();

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
      {organizationName && (
        <PageHeading className="mb-2">{organizationName}</PageHeading>
      )}
      <div className="border-b border-neutral-200">
        <TabSelect options={tabs} selected={selected} />
      </div>
    </div>
  );
}
