import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("account-linking-handler");

/**
 * This route is called after a successful OAuth authentication in the linking flow
 * It links the newly created account to the original user and cleans up
 */
export const POST = withError(async (request: Request) => {
  try {
    // Extract the link account headers
    const linkAccount = request.headers.get("x-link-account");
    const originalUserId = request.headers.get("x-original-user-id");

    if (linkAccount !== "true" || !originalUserId) {
      return NextResponse.json(
        { error: "Invalid account linking request" },
        { status: 400 },
      );
    }

    // Get the payload that includes the OAuth account details
    const payload = await request.json();
    const { accountId, email, provider } = payload;

    if (!accountId || !email || !provider) {
      return NextResponse.json(
        { error: "Missing required account information" },
        { status: 400 },
      );
    }

    // Find the newly created user account (created by NextAuth)
    const newAccount = await prisma.account.findUnique({
      where: {
        id: accountId,
      },
      include: {
        user: true,
      },
    });

    if (!newAccount) {
      logger.error("Account not found", { accountId });
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Check if the new account is associated with a new user
    if (newAccount.userId === originalUserId) {
      logger.info("Account already linked to the original user", {
        accountId,
        originalUserId,
      });
      return NextResponse.json({ success: true });
    }

    // Get the temporary user that was created during OAuth
    const tempUser = newAccount.user;

    // Update the account to be associated with the original user
    await prisma.account.update({
      where: {
        id: accountId,
      },
      data: {
        userId: originalUserId,
      },
    });

    // Delete the temporary user (if it's not the original user)
    // But first check if there are any other accounts linked to it
    const otherAccounts = await prisma.account.findMany({
      where: {
        userId: tempUser.id,
      },
    });

    if (otherAccounts.length === 0) {
      await prisma.user.delete({
        where: {
          id: tempUser.id,
        },
      });

      logger.info("Deleted temporary user", { userId: tempUser.id });
    }

    logger.info("Successfully linked account", {
      originalUserId,
      email,
      provider,
    });

    // Clean response with no cookies
    const response = NextResponse.json({ success: true });
    response.cookies.delete("link_account");
    response.cookies.delete("original_user_id");

    return response;
  } catch (error) {
    logger.error("Error linking account", { error });
    return NextResponse.json(
      { error: "Failed to link account" },
      { status: 500 },
    );
  }
});
