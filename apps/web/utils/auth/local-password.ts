import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { env } from "@/env";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12).max(128),
});

export async function setLocalPassword(input: {
  email: string;
  password: string;
}) {
  if (!env.LOCAL_PASSWORD_AUTH_ENABLED) {
    throw new SafeError(
      "Enable LOCAL_PASSWORD_AUTH_ENABLED before provisioning a local password.",
    );
  }
  const { email, password } = credentialsSchema.parse(input);
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) throw new SafeError("No existing user has this email address.");
  const hashedPassword = await hashPassword(password);
  await prisma.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: "credential",
        providerAccountId: user.id,
      },
    },
    create: {
      userId: user.id,
      provider: "credential",
      providerAccountId: user.id,
      type: "credential",
      password: hashedPassword,
    },
    update: { password: hashedPassword },
  });
}
