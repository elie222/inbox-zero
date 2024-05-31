import Link from "next/link";
import useSWR from "swr";
import { PlusCircle } from "lucide-react";
import { gmail_v1 } from "googleapis";
import { GroupsResponse } from "@/app/api/user/group/route";
import { toastSuccess, toastError } from "@/components/Toast";
import { addGroupItemAction } from "@/utils/actions/group";
import { createFilterAction } from "@/utils/actions/mail";
import { isErrorMessage } from "@/utils/error";
import {
  DropdownMenuSubContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export function GroupsSubMenu({ sender }: { sender: string }) {
  const { data, isLoading, error } = useSWR<GroupsResponse>(`/api/user/group`);

  return (
    <DropdownMenuSubContent>
      {data && (
        <>
          {data.groups.length ? (
            data?.groups.map((group) => {
              return (
                <DropdownMenuItem
                  key={group.id}
                  onClick={async () => {
                    await addGroupItemAction({
                      groupId: group.id,
                      type: "FROM",
                      value: sender,
                    });
                    toastSuccess({
                      title: "Success!",
                      description: `Added ${sender} to ${group.name}`,
                    });
                  }}
                >
                  {group.name}
                </DropdownMenuItem>
              );
            })
          ) : (
            <DropdownMenuItem>{`You don't have any groups yet.`}</DropdownMenuItem>
          )}
        </>
      )}
      {isLoading && <DropdownMenuItem>Loading...</DropdownMenuItem>}
      {error && <DropdownMenuItem>Error loading groups</DropdownMenuItem>}
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link href="/automation?tab=groups" target="_blank">
          <PlusCircle className="mr-2 h-4 w-4" />
          <span>New Group</span>
        </Link>
      </DropdownMenuItem>
    </DropdownMenuSubContent>
  );
}

export function LabelsSubMenu({
  sender,
  labels,
}: {
  sender: string;
  labels: gmail_v1.Schema$Label[] | undefined;
}) {
  return (
    <DropdownMenuSubContent className="max-h-[415px] overflow-auto">
      {labels?.length ? (
        labels.map((label) => {
          return (
            <DropdownMenuItem
              key={label.id}
              onClick={async () => {
                if (label.id) {
                  const res = await createFilterAction(sender, label.id);
                  if (isErrorMessage(res)) {
                    toastError({
                      title: "Error",
                      description: `Failed to add ${sender} to ${label.name}. ${res.error}`,
                    });
                  } else {
                    toastSuccess({
                      title: "Success!",
                      description: `Added ${sender} to ${label.name}`,
                    });
                  }
                } else {
                  toastError({
                    title: "Error",
                    description: `Failed to add ${sender} to ${label.name}`,
                  });
                }
              }}
            >
              {label.name}
            </DropdownMenuItem>
          );
        })
      ) : (
        <DropdownMenuItem>{`You don't have any labels yet.`}</DropdownMenuItem>
      )}
    </DropdownMenuSubContent>
  );
}
