import prisma from "@/utils/prisma";
import { encryptToken, decryptToken } from "@/utils/encryption";
import { SafeError } from "@/utils/error";
import { withICloudClient } from "@/utils/icloud/client";
import {
  discoverICloudFolders,
  iCloudFoldersSchema,
  validateICloudFolders,
} from "@/utils/icloud/folders";

export async function connectICloud(input: {
  userId: string;
  email: string;
  password: string;
}) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.emailAccount.findUnique({
    where: { email },
    select: { id: true, userId: true, account: { select: { provider: true } } },
  });
  if (
    existing &&
    (existing.userId !== input.userId || existing.account.provider !== "icloud")
  )
    throw new SafeError(
      "This email address is already connected to another account.",
    );
  const folders = await withICloudClient(
    { username: email, password: input.password },
    async (client) => {
      const found = await client.list();
      const mapping = discoverICloudFolders(found);
      if (!mapping.inbox)
        throw new SafeError("iCloud did not return an Inbox folder.");
      return validateICloudFolders(mapping, found);
    },
  );
  const encryptedPassword = encryptToken(input.password);
  if (!encryptedPassword)
    throw new SafeError(
      "Configure account encryption before connecting iCloud.",
    );
  if (existing) {
    await prisma.iCloudConnection.update({
      where: { emailAccountId: existing.id },
      data: { username: email, encryptedPassword },
    });
    await prisma.account.updateMany({
      where: { emailAccount: { id: existing.id }, userId: input.userId },
      data: { disconnectedAt: null },
    });
    return { emailAccountId: existing.id };
  }
  const account = await prisma.account.create({
    data: {
      userId: input.userId,
      provider: "icloud",
      providerAccountId: email,
      type: "imap",
      emailAccount: {
        create: {
          userId: input.userId,
          email,
          name: "iCloud",
          iCloudConnection: {
            create: { username: email, encryptedPassword, folders },
          },
        },
      },
    },
    select: { emailAccount: { select: { id: true } } },
  });
  return { emailAccountId: account.emailAccount!.id };
}

export async function getICloudConnection(emailAccountId: string) {
  const connection = await prisma.iCloudConnection.findUnique({
    where: { emailAccountId },
  });
  if (!connection)
    throw new SafeError("Connect this iCloud account again in Accounts.");
  const password = decryptToken(connection.encryptedPassword);
  if (!password)
    throw new SafeError(
      "The iCloud password could not be decrypted. Reconnect the account.",
    );
  return {
    username: connection.username,
    password,
    folders: iCloudFoldersSchema.parse(connection.folders),
  };
}
