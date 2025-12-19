"use server";

import { revalidatePath } from "next/cache";
import { actionClientUser } from "@/utils/actions/safe-action";
import { linkFastmailAppTokenBody } from "@/utils/actions/fastmail-app-token.validation";
import {
  createFastmailClient,
  type FastmailClient,
} from "@/utils/fastmail/client";
import prisma from "@/utils/prisma";
import { handleAccountLinking } from "@/utils/oauth/account-linking";
import { mergeAccount } from "@/utils/user/merge-account";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { SafeError } from "@/utils/error";

export const linkFastmailAppTokenAction = actionClientUser
  .metadata({ name: "linkFastmailAppToken" })
  .schema(linkFastmailAppTokenBody)
  .action(async ({ ctx: { userId, logger }, parsedInput: { appToken } }) => {
    // Step 1: Validate the token by creating a JMAP client
    let client: FastmailClient;
    try {
      client = await createFastmailClient(appToken);
    } catch (error) {
      logger.error("Failed to validate Fastmail app token", { error });
      throw new SafeError(
        "Invalid app token. Please check your token and try again.",
      );
    }

    // Step 2: Extract email and account ID from JMAP session
    const email = client.session.username;
    const providerAccountId = client.accountId;

    if (!email) {
      throw new SafeError("Could not retrieve email from Fastmail session.");
    }

    logger.info("Validated Fastmail app token", {
      email,
      providerAccountId,
      userId,
    });

    // Step 3: Check for existing account
    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "fastmail",
          providerAccountId,
        },
      },
      select: {
        id: true,
        userId: true,
        user: { select: { name: true, email: true } },
        emailAccount: true,
      },
    });

    // Step 4: Handle account linking logic
    const linkingResult = await handleAccountLinking({
      existingAccountId: existingAccount?.id || null,
      hasEmailAccount: !!existingAccount?.emailAccount,
      existingUserId: existingAccount?.userId || null,
      targetUserId: userId,
      provider: "fastmail",
      providerEmail: email,
      logger,
    });

    if (linkingResult.type === "redirect") {
      // Account exists for different user - need to show merge option
      throw new SafeError(
        "This Fastmail account is already linked to another user.",
      );
    }

    if (linkingResult.type === "continue_create") {
      logger.info(
        "Creating new Fastmail account with app token and linking to current user",
        {
          email,
          userId,
        },
      );

      try {
        const newAccount = await prisma.account.create({
          data: {
            userId,
            type: "app_token",
            provider: "fastmail",
            providerAccountId,
            access_token: appToken,
            refresh_token: null,
            expires_at: null, // App tokens don't expire
            scope:
              "urn:ietf:params:jmap:core urn:ietf:params:jmap:mail urn:ietf:params:jmap:submission",
            token_type: "Bearer",
            id_token: null,
            emailAccount: {
              create: {
                email: email.toLowerCase(),
                userId,
                name: null,
                image: null,
              },
            },
          },
        });

        logger.info("Successfully created Fastmail account with app token", {
          email,
          userId,
          accountId: newAccount.id,
        });

        revalidatePath("/accounts");
        return { success: true, message: "Account linked successfully" };
      } catch (createError: unknown) {
        if (isDuplicateError(createError)) {
          const accountNow = await prisma.account.findUnique({
            where: {
              provider_providerAccountId: {
                provider: "fastmail",
                providerAccountId,
              },
            },
            select: { userId: true },
          });

          if (accountNow?.userId === userId) {
            logger.info(
              "Account was created by concurrent request, continuing",
              {
                userId,
                providerAccountId,
              },
            );
            revalidatePath("/accounts");
            return { success: true, message: "Account linked successfully" };
          }
        }
        throw createError;
      }
    }

    if (linkingResult.type === "update_tokens") {
      logger.info("Updating app token for existing Fastmail account", {
        email,
        userId,
        accountId: linkingResult.existingAccountId,
      });

      await prisma.account.update({
        where: { id: linkingResult.existingAccountId },
        data: {
          type: "app_token",
          access_token: appToken,
          refresh_token: null,
          expires_at: null,
        },
      });

      logger.info("Successfully updated Fastmail app token", {
        email,
        userId,
        accountId: linkingResult.existingAccountId,
      });

      revalidatePath("/accounts");
      return { success: true, message: "Account token updated successfully" };
    }

    // Handle merge case
    logger.info("Merging Fastmail account", {
      email,
      providerAccountId,
      existingUserId: linkingResult.sourceUserId,
      targetUserId: userId,
    });

    await mergeAccount({
      sourceAccountId: linkingResult.sourceAccountId,
      sourceUserId: linkingResult.sourceUserId,
      targetUserId: userId,
      email,
      name: existingAccount?.user.name || null,
      logger,
    });

    // Update the merged account with new app token
    await prisma.account.update({
      where: { id: linkingResult.sourceAccountId },
      data: {
        type: "app_token",
        access_token: appToken,
        refresh_token: null,
        expires_at: null,
      },
    });

    logger.info("Account merged and updated with app token", {
      providerAccountId,
      userId,
      originalUserId: linkingResult.sourceUserId,
    });

    revalidatePath("/accounts");
    return { success: true, message: "Account merged successfully" };
  });
