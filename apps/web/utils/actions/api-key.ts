"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import {
  createApiKeyBody,
  deactivateApiKeyBody,
} from "@/utils/actions/validation";
import type {
  CreateApiKeyBody,
  DeactivateApiKeyBody,
} from "@/utils/actions/validation";
import prisma from "@/utils/prisma";
import { generateSecureToken, hashApiKey } from "@/utils/api-key";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("Api Key Action");

export const createApiKeyAction = withActionInstrumentation(
  "createApiKey",
  async (unsafeData: CreateApiKeyBody) => {
    const session = await auth();
    const userId = session?.user.id;
    if (!userId) return { error: "Not logged in" };

    const { data, success, error } = createApiKeyBody.safeParse(unsafeData);
    if (!success) return { error: error.message };

    logger.info("Creating API key", { userId });

    const secretKey = generateSecureToken();
    const hashedKey = hashApiKey(secretKey);

    await prisma.apiKey.create({
      data: {
        userId,
        name: data.name || "Secret key",
        hashedKey,
        isActive: true,
      },
    });

    revalidatePath("/settings");

    return { secretKey };
  },
);

export const deactivateApiKeyAction = withActionInstrumentation(
  "deactivateApiKey",
  async (unsafeData: DeactivateApiKeyBody) => {
    const session = await auth();
    const userId = session?.user.id;
    if (!userId) return { error: "Not logged in" };

    const { data, success, error } = deactivateApiKeyBody.safeParse(unsafeData);
    if (!success) return { error: error.message };

    logger.info("Deactivating API key", { userId });

    await prisma.apiKey.update({
      where: { id: data.id, userId },
      data: { isActive: false },
    });

    revalidatePath("/settings");
  },
);
