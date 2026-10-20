"use client";

import { usePathname } from "next/navigation";
import { TabSelect } from "@/components/TabSelect";
import { PageHeading, PageSubHeading } from "@/components/Typography";

export function SharedTabs() {
  const pathname = usePathname();

  return (
    <div>
      <div className="mb-4">
        <PageHeading>Discussions</PageHeading>
        <PageSubHeading className="mt-1">
          Email threads your teammates share with you to discuss in private
          comments.
        </PageSubHeading>
      </div>
      <div className="border-b border-neutral-200">
        <TabSelect
          options={[
            { id: "conversations", label: "Conversations", href: "/shared" },
            { id: "activity", label: "Activity", href: "/shared/activity" },
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
      This account isn't in an organization. Switch to an account that is to see
      conversations your teammates share with you.
    </p>
  );
}
