import { XMLParser } from "fast-xml-parser";
import { env } from "@/env";
import { betterAuthConfig } from "@/utils/auth";
import prisma from "@/utils/prisma";

export async function registerSSOProvider({
  idpMetadata,
  providerId,
  organizationName,
  domain,
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

  const organizationSlug = organizationName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const idpDescriptor = entityDescriptor["md:IDPSSODescriptor"];
  if (!idpDescriptor) {
    throw new Error("Missing IDPSSODescriptor in IdP metadata");
  }

  const keyDescriptors = idpDescriptor["md:KeyDescriptor"];
  if (!keyDescriptors) {
    throw new Error("Missing KeyDescriptor in IdP metadata");
  }

  // Normalize to array
  const keyDescriptorArray = Array.isArray(keyDescriptors)
    ? keyDescriptors
    : [keyDescriptors];

  // Select appropriate descriptor (prefer signing, otherwise first)
  const selectedKeyDescriptor =
    keyDescriptorArray.find((desc) => desc["@_use"] === "signing") ||
    keyDescriptorArray[0];

  if (!selectedKeyDescriptor) {
    throw new Error("No valid KeyDescriptor found in IdP metadata");
  }

  const keyInfo = selectedKeyDescriptor["ds:KeyInfo"];
  if (!keyInfo) {
    throw new Error("Missing KeyInfo in IdP metadata");
  }

  const x509Data = keyInfo["ds:X509Data"];
  if (!x509Data) {
    throw new Error("Missing X509Data in IdP metadata");
  }

  const x509Certificate = x509Data["ds:X509Certificate"];
  if (
    !x509Certificate ||
    typeof x509Certificate !== "string" ||
    !x509Certificate.trim()
  ) {
    throw new Error("Missing or empty X509Certificate in IdP metadata");
  }

  const cert = `-----BEGIN CERTIFICATE-----\n${x509Certificate.trim()}\n-----END CERTIFICATE-----`;

  const singleSignOnServices = idpDescriptor["md:SingleSignOnService"];
  if (!singleSignOnServices) {
    throw new Error("Missing SingleSignOnService in IdP metadata");
  }

  let entryPoint: string | undefined;

  if (Array.isArray(singleSignOnServices)) {
    const httpPostService = singleSignOnServices.find(
      (service) =>
        service &&
        service["@_Binding"] ===
          "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
    );
    entryPoint = httpPostService?.["@_Location"];
  } else if (singleSignOnServices && typeof singleSignOnServices === "object") {
    entryPoint = singleSignOnServices["@_Location"];
  } else {
    throw new Error("Invalid SingleSignOnService format in IdP metadata");
  }

  if (!entryPoint || typeof entryPoint !== "string" || !entryPoint.trim()) {
    throw new Error("Missing or empty entry point location in IdP metadata");
  }
  const spMetadata = `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${env.NEXT_PUBLIC_BASE_URL}">
  <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${env.NEXT_PUBLIC_BASE_URL}/api/auth/sso/saml2/callback/${providerId}" index="0"/>
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;

  let organization: { id: string } | null =
    await prisma.organization.findUnique({
      where: {
        slug: organizationSlug,
      },
    });
  if (!organization) {
    organization = await betterAuthConfig.api.createOrganization({
      body: {
        name: organizationName,
        slug: organizationSlug,
        keepCurrentActiveOrganization: true,
      },
      headers,
    });
  }
  if (!organization) {
    throw new Error("Failed to create or find organization");
  }

  const existingSSOProvider = await prisma.ssoProvider.findUnique({
    where: {
      providerId: providerId,
    },
  });

  if (existingSSOProvider) {
    throw new Error(`SSO provider with ID "${providerId}" already exists`);
  }
  // Normalize domain and encode providerId
  const normalizedDomain = domain.trim().toLowerCase();
  const encodedProviderId = encodeURIComponent(providerId);

  return await betterAuthConfig.api.registerSSOProvider({
    body: {
      providerId,
      organizationId: organization.id,
      issuer,
      domain: normalizedDomain,
      samlConfig: {
        entryPoint,
        cert,
        callbackUrl: `${env.NEXT_PUBLIC_BASE_URL}/api/auth/sso/saml2/callback/${encodedProviderId}`,
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
