"use server";

import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { getGmailAccessToken } from "@/utils/gmail/client";
import { checkGmailPermissions } from "@/utils/gmail/permissions";

export const checkPermissionsAction = withActionInstrumentation(
  "checkPermissions",
  async () => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    try {
      const token = await getGmailAccessToken(session);
      if (!token.token) return { error: "No Gmail access token" };

      const { hasAllPermissions, error } = await checkGmailPermissions(
        token.token,
      );
      if (error) return { error };
      return { hasAllPermissions };
    } catch (error) {
      return { error: "Failed to check permissions" };
    }
  },
);
