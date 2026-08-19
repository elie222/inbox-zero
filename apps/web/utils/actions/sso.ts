"use server";

import { env } from "@/env";
import { ssoRegistrationBody } from "@/utils/actions/sso.validation";
import { adminActionClient } from "@/utils/actions/safe-action";
import { auth } from "@/utils/auth";
import { SafeError } from "@/utils/error";
import { extractSSOProviderConfigFromXML } from "@/utils/sso/extract-sso-provider-config-from-xml";
import prisma from "@/utils/prisma";
import { validateIdpMetadata } from "@/utils/sso/validate-idp-metadata";
import { ADMIN_ROLES } from "@/utils/organizations/roles";
import { slugify } from "@/utils/string";

export const registerSSOProviderAction = adminActionClient
  .metadata({ name: "registerSSOProvider" })
  .inputSchema(ssoRegistrationBody)
  .action(
    async ({
      parsedInput: { organizationName, idpMetadata, domain, providerId },
    }) => {
      const session = await auth();
      const userId = session?.user?.id;

      if (!userId) throw new SafeError("Unauthorized");

      if (!validateIdpMetadata(idpMetadata))
        throw new SafeError("Invalid IDP metadata XML.");

      const ssoConfig = extractSSOProviderConfigFromXML(
        idpMetadata,
        providerId,
      );

      const existingSSOProvider = await prisma.ssoProvider.findUnique({
        where: {
          providerId: providerId,
        },
      });

      if (existingSSOProvider) {
        throw new SafeError(
          `SSO provider with ID "${providerId}" already exists`,
        );
      }

      // Create organization
      const organizationSlug = slugify(organizationName);

      const existingOrganization = await prisma.organization.findUnique({
        where: { slug: organizationSlug },
        select: {
          id: true,
          name: true,
          slug: true,
          SsoProvider: { select: { providerId: true } },
          members: {
            where: { role: { in: ADMIN_ROLES } },
            select: { emailAccount: { select: { email: true } } },
          },
        },
      });

      if (existingOrganization) {
        if (existingOrganization.SsoProvider.length) {
          throw new SafeError(
            "This organization already has an SSO provider configured.",
          );
        }

        // Guard against slug squatting: only attach SSO to an existing
        // organization if one of its owners/admins belongs to the SSO domain.
        const domainSuffix = `@${domain.toLowerCase()}`;
        const hasAdminOnDomain = existingOrganization.members.some((member) =>
          member.emailAccount.email.toLowerCase().endsWith(domainSuffix),
        );

        if (!hasAdminOnDomain) {
          throw new SafeError(
            `An organization with this name already exists, but none of its owners or admins have an email on "${domain}". Verify the organization before attaching SSO, or choose a different name.`,
          );
        }
      }

      const organization =
        existingOrganization ??
        (await prisma.organization.create({
          data: {
            name: organizationName,
            slug: organizationSlug,
          },
          select: { id: true, name: true, slug: true },
        }));

      // Compute callback URL to store with config (informational)
      const callbackUrl = new URL(
        `/api/auth/sso/saml2/callback/${encodeURIComponent(providerId)}`,
        env.NEXT_PUBLIC_BASE_URL,
      ).toString();

      const samlConfig = {
        entryPoint: ssoConfig.entryPoint,
        cert: ssoConfig.cert,
        callbackUrl,
        wantAssertionsSigned: ssoConfig.wantAssertionsSigned ?? true,
        signatureAlgorithm: "sha256",
        digestAlgorithm: "sha256",
        identifierFormat:
          "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
        idpMetadata: {
          metadata: idpMetadata,
          isAssertionEncrypted: false,
        },
        spMetadata: {
          metadata: ssoConfig.spMetadata,
          binding: "post",
          isAssertionEncrypted: false,
        },
      } as const;

      const created = await prisma.ssoProvider.create({
        data: {
          providerId,
          issuer: ssoConfig.issuer,
          domain,
          samlConfig: JSON.stringify(samlConfig),
          organizationId: organization.id,
        },
        select: {
          id: true,
          providerId: true,
          domain: true,
          organization: {
            select: { id: true, name: true, slug: true },
          },
        },
      });

      return { ...created, callbackUrl };
    },
  );
