import { toastSuccess, toastError } from "@/components/Toast";
import {
  createAutoArchiveFilterAction,
  deleteFilterAction,
  trashThreadAction,
} from "@/utils/actions/mail";

export async function onAutoArchive({
  email,
  from,
  gmailLabelId,
}: {
  email: string;
  from: string;
  gmailLabelId?: string;
}) {
  const result = await createAutoArchiveFilterAction(email, {
    from,
    gmailLabelId,
  });

  if (result?.serverError) {
    toastError({
      description:
        `There was an error enabling auto archive. ${result.serverError || ""}`.trim(),
    });
  } else {
    toastSuccess({
      description: "Auto archive enabled!",
    });
  }
}

export async function onDeleteFilter({
  email,
  filterId,
}: {
  email: string;
  filterId: string;
}) {
  const result = await deleteFilterAction(email, { id: filterId });
  if (result?.serverError) {
    toastError({
      description:
        `There was an error disabling auto archive. ${result.serverError || ""}`.trim(),
    });
  } else {
    toastSuccess({
      description: "Auto archive disabled!",
    });
  }
}

export async function onTrashThread({
  email,
  threadId,
}: {
  email: string;
  threadId: string;
}) {
  const result = await trashThreadAction(email, { threadId });
  if (result?.serverError) {
    toastError({
      description:
        `There was an error deleting the thread. ${result.serverError || ""}`.trim(),
    });
  } else {
    toastSuccess({
      description: "Thread deleted!",
    });
  }
}
