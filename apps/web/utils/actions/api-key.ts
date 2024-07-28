"use server";

import { randomBytes, scryptSync } from "node:crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { createApiKeyBody, deactivateApiKeyBody } from "@/utils/actions/validation";
import type { CreateApiKeyBody, DeactivateApiKeyBody } from "@/utils/actions/validation";
import { ServerActionResponse } from "@/utils/error";
import prisma from "@/utils/prisma";

export async function createApiKeyAction(
  unsafeData: CreateApiKeyBody,
): Promise<ServerActionResponse<{ secretKey: string }>> {
  const session = await auth();
  const userId = session?.user.id;
  if (!userId) return { error: "Not logged in" };

  const data = createApiKeyBody.safeParse(unsafeData);
  if (!data.success) return { error: "Invalid data" };

  console.log(`Creating API key for ${userId}`);

  const secretKey = generateSecureApiKey();
  const hashedKey = hashApiKey(secretKey);

  await prisma.apiKey.create({
    data: {
      userId,
      name: data.data.name || "Secret key",
      hashedKey,
      isActive: true,
    },
  });

  revalidatePath("/settings");

  return { secretKey };
}

function generateSecureApiKey(): string {
  return randomBytes(32).toString("base64");
}

function hashApiKey(apiKey: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(apiKey, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function deactivateApiKeyAction(
  unsafeData: DeactivateApiKeyBody,
): Promise<ServerActionResponse> {
  const session = await auth();
  const userId = session?.user.id;
  if (!userId) return { error: "Not logged in" };

  const data = deactivateApiKeyBody.safeParse(unsafeData);
  if (!data.success) return { error: "Invalid data" };

  console.log(`Deactivating API key for ${userId}`);

  await prisma.apiKey.update({
    where: { id: data.data.id, userId },
    data: { isActive: false },
  });

  revalidatePath("/settings");
}
