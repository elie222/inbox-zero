"use client";

import useSWR, { type KeyedMutator } from "swr";
import Link from "next/link";
import { PlusIcon, ExternalLinkIcon, TrashIcon } from "lucide-react";
import {
  useState,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { capitalCase } from "capital-case";
import { toastSuccess, toastError } from "@/components/Toast";
import type { GroupItemsResponse } from "@/app/api/user/group/[groupId]/items/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableRow,
  TableBody,
  TableCell,
  TableHeader,
  TableHead,
} from "@/components/ui/table";
import { MessageText } from "@/components/Typography";
import {
  addGroupItemAction,
  deleteGroupItemAction,
} from "@/utils/actions/group";
import { type GroupItem, GroupItemType } from "@prisma/client";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type AddGroupItemBody,
  addGroupItemBody,
} from "@/utils/actions/validation";
import { isActionError } from "@/utils/error";
import { Badge } from "@/components/ui/badge";

export function ViewGroup({ groupId }: { groupId: string }) {
  const { data, isLoading, error, mutate } = useSWR<GroupItemsResponse>(
    `/api/user/group/${groupId}/items`,
  );
  const group = data?.group;

  const [showAddItem, setShowAddItem] = useState(false);

  return (
    <div className="mt-2 px-4">
      {showAddItem ? (
        <AddGroupItemForm
          groupId={groupId}
          mutate={mutate}
          setShowAddItem={setShowAddItem}
        />
      ) : (
        <div className="sm:flex sm:items-center sm:justify-between">
          <div />
          {/* <div className="flex items-center space-x-1.5">
            <TooltipExplanation text="Automatically detect and add new matching patterns from incoming emails." />
            <Toggle
              name="auto-update"
              label="Auto-add patterns"
              enabled={true}
              onChange={(enabled) => {}}
            />
          </div> */}

          <div className="mt-2 grid grid-cols-1 gap-1 sm:mt-0 sm:flex sm:items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddItem(true)}
            >
              <PlusIcon className="mr-2 h-4 w-4" />
              Add pattern
            </Button>

            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/automation/group/${groupId}/examples`}
                target="_blank"
              >
                <ExternalLinkIcon className="mr-2 size-4" />
                Matches
              </Link>
            </Button>
          </div>
        </div>
      )}

      <div className="mt-2">
        <LoadingContent
          loading={!data && isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-24 rounded" />}
        >
          {data &&
            (group?.items.length ? (
              <GroupItems items={group.items} mutate={mutate} />
            ) : (
              <MessageText className="mt-4">
                There are no senders in this group.
              </MessageText>
            ))}
        </LoadingContent>
      </div>
    </div>
  );
}

const AddGroupItemForm = ({
  groupId,
  mutate,
  setShowAddItem,
}: {
  groupId: string;
  mutate: KeyedMutator<GroupItemsResponse>;
  setShowAddItem: Dispatch<SetStateAction<boolean>>;
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AddGroupItemBody>({
    resolver: zodResolver(addGroupItemBody),
    defaultValues: { groupId },
  });

  const onClose = useCallback(() => {
    setShowAddItem(false);
  }, [setShowAddItem]);

  const onSubmit: SubmitHandler<AddGroupItemBody> = useCallback(
    async (data) => {
      const result = await addGroupItemAction(data);
      if (isActionError(result)) {
        toastError({
          description: `Failed to add ${data.value} to ${data.groupId}. ${result.error}`,
        });
      } else {
        toastSuccess({ description: "Item added to group!" });
      }
      mutate();
      onClose();
    },
    [mutate, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        void handleSubmit(onSubmit)(e);
      }
    },
    [handleSubmit, onSubmit],
  );

  return (
    <div
      className="grid grid-cols-1 gap-2 sm:flex sm:items-center"
      onKeyDown={handleKeyDown}
    >
      <Select
        label=""
        options={[
          { label: "From", value: GroupItemType.FROM },
          { label: "Subject", value: GroupItemType.SUBJECT },
        ]}
        {...register("type", { required: true })}
        error={errors.type}
      />
      <Input
        type="text"
        name="value"
        placeholder="e.g. hello@company.com"
        registerProps={register("value", { required: true })}
        error={errors.value}
        className="min-w-[250px]"
      />
      <Button
        type="button"
        loading={isSubmitting}
        onClick={() => {
          handleSubmit(onSubmit)();
        }}
      >
        Add
      </Button>
      <Button type="button" variant="outline" onClick={onClose}>
        Cancel
      </Button>
    </div>
  );
};

function GroupItems({
  items,
  mutate,
}: {
  items: GroupItem[];
  mutate: KeyedMutator<GroupItemsResponse>;
}) {
  // const groupedByStatus = groupBy(
  //   items,
  //   (item) => item.status || GroupItemStatus.APPROVED,
  // );

  return (
    <div className="space-y-4">
      <GroupItemList
        title={
          <div className="flex items-center gap-x-1.5">
            When these patterns are encountered, the rule will automatically
            match:
          </div>
        }
        items={items}
        mutate={mutate}
      />
      {/* <GroupItemList
        title={
          <div className="flex items-center gap-x-1.5">
            These patterns will never match:
          </div>
        }
        items={groupedByStatus[GroupItemStatus.REJECTED] || []}
        mutate={mutate}
      />
      <GroupItemList
        title={
          <div className="flex items-center gap-x-1.5">
            These patterns will need evaluation (and the AI will not move them
            to the Match or Never Match lists):
          </div>
        }
        items={groupedByStatus[GroupItemStatus.EVALUATE] || []}
        mutate={mutate}
      /> */}
    </div>
  );
}

function GroupItemList({
  title,
  items,
  mutate,
}: {
  title?: React.ReactNode;
  items: GroupItem[];
  mutate: KeyedMutator<GroupItemsResponse>;
}) {
  return (
    <Table>
      {title && (
        <TableHeader>
          <TableRow>
            <TableHead>{title}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
      )}
      <TableBody>
        {items.map((item) => {
          const twoMinutesAgo = new Date(Date.now() - 1000 * 60 * 2);
          const isCreatedRecently = new Date(item.createdAt) > twoMinutesAgo;
          const isUpdatedRecently = new Date(item.updatedAt) > twoMinutesAgo;

          return (
            <TableRow key={item.id}>
              <TableCell>
                <div className="flex items-center">
                  {isCreatedRecently ||
                    (isUpdatedRecently && (
                      <Badge variant="green" className="mr-1">
                        {isCreatedRecently ? "New!" : "Updated"}
                      </Badge>
                    ))}

                  <div className="text-wrap break-words">
                    <GroupItemDisplay item={item} />
                  </div>
                </div>
              </TableCell>
              <TableCell className="py-2 text-right">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={async () => {
                    const result = await deleteGroupItemAction(item.id);
                    if (isActionError(result)) {
                      toastError({
                        description: `Failed to remove ${item.value} from group. ${result.error}`,
                      });
                    } else {
                      mutate();
                    }
                  }}
                >
                  <TrashIcon className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}

        {items.length === 0 && (
          <TableRow>
            <TableCell colSpan={2}>
              <MessageText>No items</MessageText>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

export function GroupItemDisplay({
  item,
}: {
  item: Pick<GroupItem, "type" | "value">;
}) {
  return (
    <>
      <Badge variant="secondary" className="mr-2">
        {capitalCase(item.type)}
      </Badge>
      {item.value}
    </>
  );
}
