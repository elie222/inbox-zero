import { env } from "@/env";
import { betterAuthConfig } from "@/utils/auth";
import prisma from "@/utils/prisma";
import { XMLParser } from "fast-xml-parser";
import type { Organization as PrismaOrganization } from "@prisma/client";

// Union type for organization that can be either from Prisma or better-auth
type Organization = PrismaOrganization | { id: string; [key: string]: any };

export async function registerSSOProvider({
  idpMetadata,
  providerId,
  organizationName,
  domain,
  userId,
  headers,
}: {
  idpMetadata: string;
  providerId: string;
  organizationName: string;
  domain: string;
  userId: string;
  headers: Headers;
}) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: true,
    parseTagValue: true,
  });
  const metadata = parser.parse(idpMetadata);

  const entityDescriptor = metadata["md:EntityDescriptor"];
  const issuer = entityDescriptor?.["@_entityID"];

  if (!issuer) {
    throw new Error("Could not find entityID in IdP metadata");
  }

  const organizationSlug = organizationName.toLowerCase().replace(/ /g, "-");
  const idpDescriptor = entityDescriptor["md:IDPSSODescriptor"];
  const keyDescriptor = idpDescriptor["md:KeyDescriptor"];
  const x509Certificate =
    keyDescriptor["ds:KeyInfo"]["ds:X509Data"]["ds:X509Certificate"];
  const cert = `-----BEGIN CERTIFICATE-----\n${x509Certificate}\n-----END CERTIFICATE-----`;
  const singleSignOnServices = idpDescriptor["md:SingleSignOnService"];
  const entryPoint = Array.isArray(singleSignOnServices)
    ? singleSignOnServices.find(
        (service) =>
          service["@_Binding"] ===
          "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
      )?.["@_Location"]
    : singleSignOnServices["@_Location"];

  // generic SP Metadata, for the full SP Metadata
  // @see https://www.better-auth.com/docs/plugins/sso#get-service-provider-metadata
  const spMetadata = `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${env.NEXT_PUBLIC_BASE_URL}">
  <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${env.NEXT_PUBLIC_BASE_URL}/api/auth/sso/saml2/callback/${providerId}" index="0"/>
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;

  // Organization must exist before an SSO provider can be registered and attached to it
  let organization: Organization | null = await prisma.organization.findUnique({
    where: {
      slug: organizationSlug,
    },
  });
  if (!organization) {
    // Create the organization
    organization = await betterAuthConfig.api.createOrganization({
      body: {
        name: organizationName,
        slug: organizationName.toLowerCase().replace(/ /g, "-"),
        keepCurrentActiveOrganization: true,
      },
      headers,
    });
  }
  if (!organization) {
    throw new Error("Failed to create or find organization");
  }

  // If the SSO provider has an organization, the user adding it must be a member of the organization
  // Check if user is already a member of the organization
  const existingMember = await prisma.member.findUnique({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: userId,
      },
    },
  });

  if (!existingMember) {
    await betterAuthConfig.api.addMember({
      body: {
        userId: userId,
        role: ["owner"],
        organizationId: organization.id,
      },
    });
  }

  // Check if an SSO provider with this providerId already exists
  const existingSSOProvider = await prisma.ssoProvider.findUnique({
    where: {
      providerId: providerId,
    },
  });

  if (existingSSOProvider) {
    throw new Error(`SSO provider with ID "${providerId}" already exists`);
  }

  // The SSO provider must be registered once before sign in can happen
  return await betterAuthConfig.api.registerSSOProvider({
    body: {
      providerId,
      organizationId: organization.id,
      issuer,
      domain,
      samlConfig: {
        entryPoint,
        cert,
        callbackUrl: `${env.NEXT_PUBLIC_BASE_URL}/api/auth/sso/saml2/callback/${providerId}`,
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
          metadata: spMetadata,
          binding: "post",
          isAssertionEncrypted: false,
        },
      },
    },
    headers,
  });
}
