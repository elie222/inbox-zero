"use client";

import useSWR, { type KeyedMutator } from "swr";
import sortBy from "lodash/sortBy";
import groupBy from "lodash/groupBy";
import { PlusIcon, TrashIcon, Undo2Icon } from "lucide-react";
import {
  useState,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";
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
import { MessageText, MutedText } from "@/components/Typography";
import {
  addGroupItemAction,
  deleteGroupItemAction,
} from "@/utils/actions/group";
import { GroupItemSource, GroupItemType } from "@/generated/prisma/enums";
import type { GroupItem } from "@/generated/prisma/client";
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
                <Trans>Add pattern</Trans>
              </Button>
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
                <Trans>No learned patterns yet</Trans>
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
  const { t } = useLingui();
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
          description: t`Failed to add pattern. ${result.serverError || ""}`,
        });
      } else {
        toastSuccess({ description: t`Pattern added!` });
      }
      mutate();
      onClose();
    },
    [mutate, onClose, emailAccountId, exclude, t],
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
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          label=""
          options={[
            { label: t`From`, value: GroupItemType.FROM },
            { label: t`Subject`, value: GroupItemType.SUBJECT },
          ]}
          {...register("type", { required: true })}
          error={errors.type}
        />
        <div className="flex-1">
          <Input
            type="text"
            name="value"
            placeholder={t`e.g. hello@company.com`}
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
            <Trans>Add</Trans>
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            <Trans>Cancel</Trans>
          </Button>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Toggle
          name="exclude"
          tooltipText={t`When enabled, never match this pattern.`}
          label={t`Exclude`}
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
            <Trans>
              When these patterns are encountered, the rule will automatically
              match:
            </Trans>
          </div>
        }
        items={groupedByStatus.include || []}
        mutate={mutate}
      />
      {(groupedByStatus.exclude?.length || 0) > 0 && (
        <GroupItemList
          title={
            <div className="flex items-center gap-x-1.5">
              <Trans>
                When these patterns are encountered, the rule will never match:
              </Trans>
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
  const { t, i18n } = useLingui();

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
          const isLearnedFromLabelRemoval =
            item.exclude && item.source === GroupItemSource.LABEL_REMOVED;

          return (
            <TableRow key={item.id}>
              <TableCell>
                <div className="flex items-center">
                  {isCreatedRecently ||
                    (isUpdatedRecently && (
                      <Badge variant="green" className="mr-1">
                        {isCreatedRecently ? t`New!` : t`Updated`}
                      </Badge>
                    ))}

                  <div className="break-all">
                    <GroupItemDisplay item={item} />
                    {isLearnedFromLabelRemoval && (
                      <Badge variant="muted" size="sm" className="ml-2">
                        <Trans>Learned from label removal</Trans>
                      </Badge>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="flex items-center justify-end gap-4 py-2 text-right">
                <Tooltip content={t`Date added`}>
                  <MutedText className="hidden sm:block">
                    {formatShortDate(new Date(item.createdAt), {
                      locale: i18n.locale,
                    })}
                  </MutedText>
                </Tooltip>

                <Button
                  variant="outline"
                  size={isLearnedFromLabelRemoval ? "sm" : "icon"}
                  aria-label={
                    isLearnedFromLabelRemoval
                      ? t`Undo exclusion for ${item.value}`
                      : t`Remove ${item.value}`
                  }
                  onClick={async () => {
                    const result = await deleteGroupItemAction(emailAccountId, {
                      id: item.id,
                    });
                    if (result?.serverError) {
                      toastError({
                        description: t`Failed to remove ${item.value}. ${result.serverError || ""}`,
                      });
                    } else {
                      toastSuccess({
                        description: isLearnedFromLabelRemoval
                          ? t`The rule can match ${item.value} again`
                          : t`Removed learned pattern!`,
                      });
                      mutate();
                    }
                  }}
                >
                  {isLearnedFromLabelRemoval ? (
                    <>
                      <Undo2Icon className="mr-1.5 size-4" />
                      <Trans>Undo</Trans>
                    </>
                  ) : (
                    <TrashIcon className="size-4" />
                  )}
                </Button>
              </TableCell>
            </TableRow>
          );
        })}

        {items.length === 0 && (
          <TableRow>
            <TableCell colSpan={3}>
              <MessageText>
                <Trans>No items</Trans>
              </MessageText>
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
  const { i18n } = useLingui();

  return (
    <>
      {item.exclude && (
        <Badge variant="destructive" className="mr-2">
          <Trans>Exclude</Trans>
        </Badge>
      )}
      <Badge variant="secondary" className="mr-2">
        {i18n._(GROUP_ITEM_TYPE_LABELS[item.type])}
      </Badge>
      {item.value}
    </>
  );
}

const GROUP_ITEM_TYPE_LABELS: Record<GroupItemType, MessageDescriptor> = {
  FROM: msg`From`,
  SUBJECT: msg`Subject`,
  BODY: msg`Body`,
};
