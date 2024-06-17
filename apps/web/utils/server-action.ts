"use client";

import { toastError, toastSuccess } from "@/components/Toast";
import { ServerActionResponse, isActionError } from "@/utils/error";

export function handleActionResult<T>(
  result: ServerActionResponse<T>,
  successMessage: string,
) {
  if (isActionError(result)) {
    toastError({ description: result.error });
  } else {
    toastSuccess({ description: successMessage });
  }
}
