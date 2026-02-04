import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { createFastmailClient } from "@/utils/fastmail/client";

export const POST = withAuth(
  "fastmail/linking/token",
  async (request) => {
    const logger = request.logger;
    const userId = request.auth.userId;

    let body;
    try {
      body = await request.json();
    } catch {
      throw new SafeError("Invalid request body");
    }

    const { token } = body;

    if (!token || typeof token !== "string") {
      throw new SafeError("API token is required");
    }

    logger.info("Validating Fastmail API token", { userId });

    const client = createFastmailClient(token, logger);

    let session_data;
    try {
      session_data = await client.getSession();
      logger.info("Fastmail session data received", {
        hasAccounts: !!session_data.accounts,
        username: session_data.username,
      });
    } catch (error) {
      logger.error("Failed to validate Fastmail token", {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw new SafeError(
        "Invalid API token. Please check your token and try again.",
      );
    }

    const accountId = await client.getAccountId();
    const account = session_data.accounts[accountId];

    if (!account) {
      throw new SafeError("No mail account found");
    }

    const userEmail = session_data.username;

    if (!userEmail) {
      throw new SafeError("Could not determine email address from token");
    }

    logger.info("Successfully validated Fastmail token", {
      userId,
      email: userEmail,
    });

    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "fastmail",
          providerAccountId: accountId,
        },
      },
      select: {
        id: true,
        userId: true,
        emailAccount: true,
      },
    });

    if (existingAccount) {
      if (existingAccount.userId === userId) {
        logger.info("Updating existing Fastmail account", {
          userId,
          accountId: existingAccount.id,
        });

        await prisma.account.update({
          where: { id: existingAccount.id },
          data: {
            access_token: token,
          },
        });

        return NextResponse.json({
          success: true,
          message: "Fastmail account updated successfully",
        });
      }

      throw new SafeError(
        "This Fastmail account is already linked to another user",
      );
    }

    logger.info("Creating new Fastmail account", {
      userId,
      email: userEmail,
    });

    await prisma.account.create({
      data: {
        userId,
        type: "oidc",
        provider: "fastmail",
        providerAccountId: accountId,
        access_token: token,
        refresh_token: null,
        expires_at: null,
        scope: null,
        token_type: "Bearer",
        emailAccount: {
          create: {
            email: userEmail,
            userId,
            name: account.name || null,
            image: null,
          },
        },
      },
    });

    logger.info("Successfully created Fastmail account", {
      userId,
      email: userEmail,
    });

    return NextResponse.json({
      success: true,
      message: "Fastmail account connected successfully",
    });
  },
);
