import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteEmailAccountAction } from "@/utils/actions/user";
import { withAuth } from "@/utils/middleware";

const paramsSchema = z.object({
  emailAccountId: z.string().min(1),
});

export type DeleteEmailAccountResponse = { deleted: true };

/**
 * Removes one connected email account owned by the authenticated user.
 * Reuses the settings-page server action. The user session stays valid.
 */
export const DELETE = withAuth(
  "user/email-accounts/delete",
  async (_request, context) => {
    const { emailAccountId } = paramsSchema.parse(await context.params);
    const result = await deleteEmailAccountAction({ emailAccountId });
    if (result?.serverError) {
      return NextResponse.json(
        { error: result.serverError, isKnownError: true },
        { status: 400 },
      );
    }

    return NextResponse.json({
      deleted: true,
    } satisfies DeleteEmailAccountResponse);
  },
);
