import {
  createAutoArchiveFilterAction,
  deleteFilterAction,
} from "@/utils/actions/mail";
import { trashMessageAction, trashThreadAction } from "@/utils/actions/mail";
import { handleActionResult } from "@/utils/server-action";

export async function onAutoArchive(from: string, gmailLabelId?: string) {
  const result = await createAutoArchiveFilterAction(from, gmailLabelId);
  handleActionResult(result, "Auto archive enabled!");
}

export async function onDeleteFilter(filterId: string) {
  const result = await deleteFilterAction(filterId);
  handleActionResult(result, "Auto archive disabled!");
}

export async function onTrashThread(threadId: string) {
  const result = await trashThreadAction(threadId);
  handleActionResult(result, "Thread deleted!");
}
export async function onTrashMessage(messageId: string) {
  const result = await trashMessageAction(messageId);
  handleActionResult(result, "Message deleted!");
}
