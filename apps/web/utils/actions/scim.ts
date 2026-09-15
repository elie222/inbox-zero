"use server";

import { env } from "@/env";
import { adminActionClient } from "@/utils/actions/safe-action";
import {
  createScimConnectionBody,
  revokeScimCredentialBody,
} from "@/utils/actions/scim.validation";
import { betterAuthConfig } from "@/utils/auth";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";

export const createScimConnectionAction = adminActionClient
  .metadata({ name: "createScimConnection" })
  .inputSchema(createScimConnectionBody)
  .action(async ({ parsedInput, ctx: { session } }) => {
    await requireScimProvider(parsedInput.providerId, session.session.emailOtp);
    const actorId = session.user.id;
    return betterAuthConfig.api.createSCIMManagedConnection({
      body: {
        provisioningDomainId: parsedInput.providerId,
        actorId,
        creationRequestId: parsedInput.creationRequestId,
        expiresAt: parsedInput.expiresAt,
        scopes: ["scim.users.read", "scim.users.write"],
      },
    });
  });

export const revokeScimCredentialAction = adminActionClient
  .metadata({ name: "revokeScimCredential" })
  .inputSchema(revokeScimCredentialBody)
  .action(async ({ parsedInput, ctx: { session } }) => {
    await requireScimProvider(parsedInput.providerId, session.session.emailOtp);
    const actorId = session.user.id;
    return betterAuthConfig.api.revokeSCIMManagedCredential({
      body: {
        provisioningDomainId: parsedInput.providerId,
        connectionId: parsedInput.connectionId,
        credentialId: parsedInput.credentialId,
        actorId,
      },
    });
  });

async function requireScimProvider(providerId: string, emailOtp: boolean) {
  if (!env.SCIM_CREDENTIAL_HASH_SECRET)
    throw new SafeError("SCIM credential management is not configured");
  if (emailOtp)
    throw new SafeError("Sign in with your identity provider to manage SCIM");
  const provider = await prisma.ssoProvider.findUnique({
    where: { providerId },
    select: { organizationId: true },
  });
  if (!provider?.organizationId)
    throw new SafeError("SCIM requires a registered organization SSO provider");
}
