import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { imapCredentialSchema } from "@/utils/actions/imap.validation";
import { encryptToken } from "@/utils/encryption";
import prisma from "@/utils/prisma";

export const POST = withAuth("imap/linking/create", async (request) => {
  const userId = request.auth.userId;
  const body = await request.json();
  const parsed = imapCredentialSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const normalizedEmail = data.email.trim().toLowerCase();

  // Check if email is already linked
  const existingEmailAccount = await prisma.emailAccount.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, userId: true },
  });

  if (existingEmailAccount) {
    if (existingEmailAccount.userId !== userId) {
      return NextResponse.json(
        { error: "This email is already linked to another account" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "This email is already linked to your account" },
      { status: 409 },
    );
  }

  // Encrypt the password
  const encryptedPassword = encryptToken(data.password);
  if (!encryptedPassword) {
    return NextResponse.json(
      { error: "Failed to encrypt credentials" },
      { status: 500 },
    );
  }

  // Create Account + ImapCredential + EmailAccount in a single transaction
  const result = await prisma.account.create({
    data: {
      userId,
      provider: "imap",
      providerAccountId: normalizedEmail,
      type: "credential",
      imapCredential: {
        create: {
          imapHost: data.imapHost,
          imapPort: data.imapPort,
          imapSecurity: data.imapSecurity,
          smtpHost: data.smtpHost,
          smtpPort: data.smtpPort,
          smtpSecurity: data.smtpSecurity,
          username: data.username,
          password: encryptedPassword,
        },
      },
      emailAccount: {
        create: {
          email: normalizedEmail,
          name: data.name || normalizedEmail.split("@")[0],
          userId,
        },
      },
    },
    include: {
      emailAccount: { select: { id: true, email: true } },
    },
  });

  return NextResponse.json({
    emailAccountId: result.emailAccount?.id,
    email: result.emailAccount?.email,
  });
});
