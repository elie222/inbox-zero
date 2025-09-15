"use client";

import useSWR, { type KeyedMutator } from "swr";
import sortBy from "lodash/sortBy";
import groupBy from "lodash/groupBy";
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
} from "@/utils/actions/group.validation";
import { Badge } from "@/components/ui/badge";
import { formatShortDate } from "@/utils/date";
import { Tooltip } from "@/components/Tooltip";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { Toggle } from "@/components/Toggle";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export function ViewLearnedPatterns({ groupId }: { groupId: string }) {
  return (
    <ErrorBoundary extra={{ component: "ViewLearnedPatterns", groupId }}>
      <ViewGroupInner groupId={groupId} />
    </ErrorBoundary>
  );
}

function ViewGroupInner({ groupId }: { groupId: string }) {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useSWR<GroupItemsResponse>(
    `/api/user/group/${groupId}/items`,
  );
  const group = data?.group;

  const [showAddItem, setShowAddItem] = useState(false);

  return (
    <div className="mt-2">
      <div className="px-4">
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

              {!!group?.items?.length && (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={prefixPath(
                      emailAccountId,
                      `/assistant/group/${groupId}/examples`,
                    )}
                    target="_blank"
                  >
                    <ExternalLinkIcon className="mr-2 size-4" />
                    Matches
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="mt-2">
        <LoadingContent
          loading={!data && isLoading}
          error={error}
          loadingComponent={<Skeleton className="m-4 h-24 rounded" />}
        >
          {data &&
            (group?.items?.length ? (
              <GroupItems items={group.items} mutate={mutate} />
            ) : (
              <MessageText className="my-4 px-4">
                No learned patterns yet
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
  const { emailAccountId } = useAccount();
  const [exclude, setExclude] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AddGroupItemBody>({
    resolver: zodResolver(addGroupItemBody),
    defaultValues: { groupId, exclude: false },
  });

  const onClose = useCallback(() => {
    setShowAddItem(false);
  }, [setShowAddItem]);

  const onSubmit: SubmitHandler<AddGroupItemBody> = useCallback(
    async (data) => {
      const result = await addGroupItemAction(emailAccountId, {
        ...data,
        exclude,
      });
      if (result?.serverError) {
        toastError({
          description: `Failed to add pattern. ${result.serverError || ""}`,
        });
      } else {
        toastSuccess({ description: "Pattern added!" });
      }
      mutate();
      onClose();
    },
    [mutate, onClose, emailAccountId, exclude],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        handleSubmit(onSubmit)(e);
      }
    },
    [handleSubmit, onSubmit],
  );

  return (
    <div onKeyDown={handleKeyDown}>
      <div className="flex gap-2">
        <Select
          label=""
          options={[
            { label: "From", value: GroupItemType.FROM },
            { label: "Subject", value: GroupItemType.SUBJECT },
          ]}
          {...register("type", { required: true })}
          error={errors.type}
        />
        <div className="flex-1">
          <Input
            type="text"
            name="value"
            placeholder="e.g. hello@company.com"
            registerProps={register("value", { required: true })}
            error={errors.value}
          />
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            loading={isSubmitting}
            onClick={() => {
              handleSubmit(onSubmit)();
            }}
          >
            Add
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Toggle
          name="exclude"
          tooltipText="When enabled, never match this pattern."
          label="Exclude"
          enabled={exclude}
          onChange={setExclude}
        />
      </div>
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
  const groupedByStatus = groupBy(items, (item) =>
    item.exclude ? "exclude" : "include",
  );

  return (
    <div className="space-y-4">
      <GroupItemList
        title={
          <div className="flex items-center gap-x-1.5">
            When these patterns are encountered, the rule will automatically
            match:
          </div>
        }
        items={groupedByStatus.include || []}
        mutate={mutate}
      />
      {(groupedByStatus.exclude?.length || 0) > 0 && (
        <GroupItemList
          title={
            <div className="flex items-center gap-x-1.5">
              When these patterns are encountered, the rule will never match:
            </div>
          }
          items={groupedByStatus.exclude || []}
          mutate={mutate}
        />
      )}
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
  const { emailAccountId } = useAccount();

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
        {sortBy(items, (item) => -new Date(item.createdAt)).map((item) => {
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
              <TableCell className="flex items-center justify-end gap-4 py-2 text-right">
                <Tooltip content="Date added">
                  <span className="text-sm text-muted-foreground">
                    {formatShortDate(new Date(item.createdAt))}
                  </span>
                </Tooltip>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={async () => {
                    const result = await deleteGroupItemAction(emailAccountId, {
                      id: item.id,
                    });
                    if (result?.serverError) {
                      toastError({
                        description: `Failed to remove ${item.value}. ${result.serverError || ""}`,
                      });
                    } else {
                      toastSuccess({
                        description: "Removed learned pattern!",
                      });
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
            <TableCell colSpan={3}>
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
  item: Pick<GroupItem, "type" | "value" | "exclude">;
}) {
  return (
    <>
      {item.exclude && (
        <Badge variant="destructive" className="mr-2">
          Exclude
        </Badge>
      )}
      <Badge variant="secondary" className="mr-2">
        {capitalCase(item.type)}
      </Badge>
      {item.value}
    </>
  );
}
