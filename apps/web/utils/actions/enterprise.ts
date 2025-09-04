"use server";

import { headers } from "next/headers";
import { env } from "@/env";
import { ssoRegistrationBody } from "@/utils/actions/enterprise.validation";
import { adminActionClient } from "@/utils/actions/safe-action";
import { betterAuthConfig, auth } from "@/utils/auth";
import { SafeError } from "@/utils/error";
import { extractSSOProviderConfigFromXML } from "@/utils/extract-sso-provider-config-from-xml";
import prisma from "@/utils/prisma";
import { validateIdpMetadata } from "@/utils/sso";

export const registerSSOProviderAction = adminActionClient
  .metadata({ name: "registerSSOProvider" })
  .schema(ssoRegistrationBody)
  .action(
    async ({
      parsedInput: { idpMetadata, organizationName, domain, providerId },
    }) => {
      const session = await auth();
      if (!session?.user?.id) {
        throw new SafeError("Unauthorized");
      }
      const userId = session.user.id;

      if (!validateIdpMetadata(idpMetadata)) {
        throw new SafeError("Invalid IDP metadata XML.");
      }

      const ssoConfig = extractSSOProviderConfigFromXML(
        idpMetadata,
        providerId,
      );

      const organizationSlug = organizationName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-]+/g, "")
        .replace(/[\s-]+/g, "-")
        .replace(/^-+|-+$/g, "");

      const existingOrganization = await prisma.organization.findUnique({
        where: {
          slug: organizationSlug,
        },
      });

      if (existingOrganization) {
        throw new SafeError(
          `Organization with name "${organizationName}" already exists`,
        );
      }

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

      const organization = await prisma.organization.create({
        data: {
          name: organizationName,
          slug: organizationSlug,
        },
      });

      await prisma.member.create({
        data: {
          userId: userId,
          organizationId: organization.id,
          role: "owner",
        },
      });

      try {
        const callbackUrl = new URL(
          `/api/auth/sso/saml2/callback/${encodeURIComponent(providerId)}`,
          env.NEXT_PUBLIC_BASE_URL,
        ).toString();

        return await betterAuthConfig.api.registerSSOProvider({
          body: {
            providerId,
            organizationId: organization.id,
            issuer: ssoConfig.issuer,
            domain,
            samlConfig: {
              entryPoint: ssoConfig.entryPoint,
              cert: ssoConfig.cert,
              callbackUrl,
              wantAssertionsSigned: false,
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
            },
          },
          headers: await headers(),
        });
      } catch (err) {
        // Cleanup to avoid orphaned orgs and members on failure
        await prisma.member.deleteMany({
          where: { organizationId: organization.id },
        });
        await prisma.organization.delete({ where: { id: organization.id } });
        throw new SafeError("Failed to register SSO provider");
      }
    },
  );
