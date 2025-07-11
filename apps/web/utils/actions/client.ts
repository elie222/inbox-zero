import { toastSuccess, toastError } from "@/components/Toast";
import {
  createAutoArchiveFilterAction,
  deleteFilterAction,
  trashThreadAction,
} from "@/utils/actions/mail";

export async function onAutoArchive({
  emailAccountId,
  from,
  gmailLabelId,
  labelName,
}: {
  emailAccountId: string;
  from: string;
  gmailLabelId?: string;
  labelName?: string;
}) {
  const result = await createAutoArchiveFilterAction(emailAccountId, {
    from,
    gmailLabelId,
    labelName,
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
  emailAccountId,
  filterId,
}: {
  emailAccountId: string;
  filterId: string;
}) {
  const result = await deleteFilterAction(emailAccountId, { id: filterId });
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
  emailAccountId,
  threadId,
}: {
  emailAccountId: string;
  threadId: string;
}) {
  const result = await trashThreadAction(emailAccountId, { threadId });
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
