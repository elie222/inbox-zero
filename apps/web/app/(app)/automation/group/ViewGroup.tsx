"use client";

import useSWR, { type KeyedMutator } from "swr";
import {
  PlusIcon,
  SparklesIcon,
  TrashIcon,
  PenIcon,
  MailIcon,
} from "lucide-react";
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
import { Modal, useModal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  MessageText,
  PageHeading,
  SectionDescription,
} from "@/components/Typography";
import {
  addGroupItemAction,
  deleteGroupAction,
  deleteGroupItemAction,
  regenerateGroupAction,
  updateGroupPromptAction,
} from "@/utils/actions/group";
import { GroupName } from "@/utils/config";
import { GroupItemType } from "@prisma/client";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type AddGroupItemBody,
  addGroupItemBody,
  updateGroupPromptBody,
  type UpdateGroupPromptBody,
} from "@/utils/actions/validation";
import { isActionError } from "@/utils/error";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export function ViewGroupButton({
  groupId,
  ButtonComponent,
}: {
  groupId: string;
  ButtonComponent?: React.ComponentType<{ onClick: () => void }>;
}) {
  const { isModalOpen, openModal, closeModal } = useModal();

  return (
    <>
      {ButtonComponent ? (
        <ButtonComponent onClick={openModal} />
      ) : (
        <Button size="sm" variant="outline" onClick={openModal}>
          Edit
        </Button>
      )}
      <Modal isOpen={isModalOpen} hideModal={closeModal} size="4xl">
        <ViewGroup groupId={groupId} onDelete={closeModal} />
      </Modal>
    </>
  );
}

export function ViewGroup({
  groupId,
  onDelete,
}: {
  groupId: string;
  onDelete: () => void;
}) {
  const { data, isLoading, error, mutate } = useSWR<GroupItemsResponse>(
    `/api/user/group/${groupId}/items`,
  );
  const group = data?.group;
  const groupName = group?.name;

  const [showAddItem, setShowAddItem] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <div>
      <PageHeading>{groupName}</PageHeading>
      {group?.prompt && (
        <EditablePrompt
          groupId={groupId}
          initialPrompt={group.prompt}
          onUpdate={mutate}
        />
      )}

      <div className="sm:flex sm:items-center sm:justify-between">
        {showAddItem ? (
          <AddGroupItemForm
            groupId={groupId}
            mutate={mutate}
            setShowAddItem={setShowAddItem}
          />
        ) : (
          <>
            {group?.rule ? (
              <div className="text-sm">
                <span>Rule: </span>
                <Link
                  href={`/automation/rule/${group.rule.id}`}
                  className="hover:underline"
                >
                  {group.rule.name || `Rule ${group.rule.id}`}
                </Link>
              </div>
            ) : (
              <Button variant="outline" asChild className="w-full sm:w-auto">
                <Link
                  href={`/automation/rule/create?groupId=${groupId}&tab=GROUP`}
                >
                  Attach Rule
                </Link>
              </Button>
            )}

            <div className="mt-2 grid grid-cols-1 gap-2 sm:mt-0 sm:flex sm:items-center">
              <Button variant="outline" onClick={() => setShowAddItem(true)}>
                <PlusIcon className="mr-2 h-4 w-4" />
                Add Item
              </Button>

              <Button
                variant="outline"
                disabled={isDeleting}
                onClick={async () => {
                  const yes = confirm(
                    "Are you sure you want to delete this group?",
                  );

                  if (!yes) return;

                  setIsDeleting(true);

                  const result = await deleteGroupAction(groupId);
                  if (isActionError(result)) {
                    toastError({
                      description: `Failed to delete group. ${result.error}`,
                    });
                  } else {
                    onDelete();
                  }
                  mutate();
                  setIsDeleting(false);
                }}
              >
                {isDeleting ? (
                  <ButtonLoader />
                ) : (
                  <TrashIcon className="mr-2 h-4 w-4" />
                )}
                Delete
              </Button>

              {(groupName === GroupName.NEWSLETTER ||
                groupName === GroupName.RECEIPT ||
                group?.prompt) && (
                <Button
                  variant="outline"
                  disabled={isRegenerating}
                  onClick={async () => {
                    setIsRegenerating(true);
                    const result = await regenerateGroupAction(groupId);

                    if (isActionError(result)) {
                      toastError({
                        description: `Failed to regenerate group. ${result.error}`,
                      });
                    } else {
                      toastSuccess({ description: "Group items regenerated!" });
                    }
                    setIsRegenerating(false);
                  }}
                >
                  {isRegenerating ? (
                    <ButtonLoader />
                  ) : (
                    <SparklesIcon className="mr-2 h-4 w-4" />
                  )}
                  Regenerate
                </Button>
              )}

              <Button variant="outline" asChild>
                <Link href={`/automation/group/${groupId}/examples`}>
                  <MailIcon className="mr-2 size-4" />
                  Matches
                </Link>
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="mt-4">
        <LoadingContent
          loading={!data && isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-24 rounded" />}
        >
          {data &&
            (group?.items.length ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sender</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group?.items.map((item) => {
                      // within last 2 minutes
                      const isRecent =
                        new Date(item.createdAt) >
                        new Date(Date.now() - 1000 * 60 * 2);

                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            {isRecent && (
                              <Badge variant="green" className="mr-2">
                                New!
                              </Badge>
                            )}

                            <Badge variant="secondary" className="mr-2">
                              {capitalCase(item.type)}
                            </Badge>
                            {item.value}
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={async () => {
                                const result = await deleteGroupItemAction(
                                  item.id,
                                );
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
                  </TableBody>
                </Table>
              </>
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

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="grid grid-cols-1 gap-2 sm:flex sm:items-center"
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
        placeholder="e.g. elie@getinboxzero.com"
        registerProps={register("value", { required: true })}
        error={errors.value}
        className="min-w-[250px]"
      />
      <Button type="submit" loading={isSubmitting}>
        Add
      </Button>
      <Button variant="outline" onClick={onClose}>
        Cancel
      </Button>
    </form>
  );
};

function EditablePrompt({
  groupId,
  initialPrompt,
  onUpdate,
}: {
  groupId: string;
  initialPrompt: string;
  onUpdate: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <UpdatePromptForm
        groupId={groupId}
        initialPrompt={initialPrompt}
        onUpdate={onUpdate}
        onFinishEditing={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div className="group relative mb-2 inline-flex items-center">
      <SectionDescription>
        Prompt: {initialPrompt}
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="ml-2 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <PenIcon className="h-4 w-4" />
        </button>
      </SectionDescription>
    </div>
  );
}

function UpdatePromptForm({
  groupId,
  initialPrompt,
  onUpdate,
  onFinishEditing,
}: {
  groupId: string;
  initialPrompt: string;
  onUpdate: () => void;
  onFinishEditing: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateGroupPromptBody>({
    resolver: zodResolver(updateGroupPromptBody),
    defaultValues: { groupId, prompt: initialPrompt },
  });

  const onSubmit: SubmitHandler<UpdateGroupPromptBody> = useCallback(
    async (data) => {
      const result = await updateGroupPromptAction(data);
      if (isActionError(result)) {
        toastError({
          description: `Failed to update prompt. ${result.error}`,
        });
      } else {
        toastSuccess({
          description: "Prompt updated! You should regenerate the group.",
        });
        onFinishEditing();
        onUpdate();
      }
    },
    [onUpdate, onFinishEditing],
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input
        type="text"
        autosizeTextarea
        rows={3}
        name="prompt"
        label="Prompt"
        placeholder=""
        registerProps={register("prompt", { required: true })}
        error={errors.prompt}
      />
      <div className="mt-2 flex items-center gap-2">
        <Button type="submit" variant="outline" disabled={isSubmitting}>
          Save
        </Button>
        <Button type="button" variant="outline" onClick={onFinishEditing}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
