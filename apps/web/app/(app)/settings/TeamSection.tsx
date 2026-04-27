"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { InviteMemberModal } from "@/components/InviteMemberModal";
import { useCurrentOrganization } from "@/hooks/useCurrentOrganization";

export function TeamSection() {
  const organization = useCurrentOrganization();
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

  return (
    <>
      <Item size="sm">
        <ItemContent>
          <ItemTitle>Invite members</ItemTitle>
          <ItemDescription>
            Share your plan by inviting teammates to your organization.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsInviteDialogOpen(true)}
          >
            Invite
          </Button>
        </ItemActions>
      </Item>

      <InviteMemberModal
        organizationId={organization?.id}
        open={isInviteDialogOpen}
        onOpenChange={setIsInviteDialogOpen}
        trigger={null}
      />
    </>
  );
}
