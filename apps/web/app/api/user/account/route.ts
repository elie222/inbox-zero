import { NextResponse } from "next/server";
import { deleteAccountAction } from "@/utils/actions/user";
import { withAuth } from "@/utils/middleware";

export type DeleteAccountResponse = { deleted: true };

/**
 * Deletes the authenticated user, including every connected email account.
 * Reuses the settings-page server action, which signs out and deletes the user.
 */
export const DELETE = withAuth("user/account/delete", async () => {
  const result = await deleteAccountAction();
  if (result?.serverError) {
    return NextResponse.json(
      { error: result.serverError, isKnownError: true },
      { status: 400 },
    );
  }

  return NextResponse.json({ deleted: true } satisfies DeleteAccountResponse);
});
