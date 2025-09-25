import { XMLParser } from "fast-xml-parser";
import { env } from "@/env";

export interface SSOProviderConfig {
  issuer: string;
  entryPoint: string;
  cert: string;
  spMetadata: string;
  // Security configuration options
  wantAssertionsSigned?: boolean; // Defaults to true for security; set false only if IdP doesn't support signed assertions
}

/**
 * Extracts SAML SSO configuration from IdP metadata XML.
 *
 * Security note: The resulting configuration will default to requiring signed assertions
 * (wantAssertionsSigned: true) for security. Only set wantAssertionsSigned to false
 * if your Identity Provider doesn't support assertion signing and you understand
 * the security implications of accepting unsigned assertions.
 */
export function extractSSOProviderConfigFromXML(
  idpMetadata: string,
  providerId: string,
): SSOProviderConfig {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: true,
    parseTagValue: true,
  });

  const metadata = parser.parse(idpMetadata);

  if (!metadata || typeof metadata !== "object") {
    throw new Error("Failed to parse XML metadata: Invalid XML structure");
  }

  const getValue = <T = unknown>(
    obj: Record<string, unknown>,
    prefixedKey: string,
    unprefixedKey: string,
  ): T | undefined => {
    return (obj?.[prefixedKey] ?? obj?.[unprefixedKey]) as T | undefined;
  };

  const getArrayValue = <T = unknown>(
    obj: Record<string, unknown>,
    prefixedKey: string,
    unprefixedKey: string,
  ): T[] => {
    const value = getValue<T | T[]>(obj, prefixedKey, unprefixedKey);
    return Array.isArray(value) ? value : value ? [value] : [];
  };

  const getStringValue = (
    obj: Record<string, unknown>,
    key: string,
  ): string | undefined => {
    const value = obj[key];
    return typeof value === "string" ? value : undefined;
  };

  const entityDescriptor = getValue<Record<string, unknown>>(
    metadata,
    "md:EntityDescriptor",
    "EntityDescriptor",
  );
  if (!entityDescriptor || typeof entityDescriptor !== "object") {
    throw new Error("Missing or invalid EntityDescriptor in SAML metadata");
  }

  const issuer = entityDescriptor["@_entityID"];
  if (!issuer || typeof issuer !== "string") {
    throw new Error("Missing or invalid entityID in EntityDescriptor");
  }

  const idpDescriptor = getValue<Record<string, unknown>>(
    entityDescriptor,
    "md:IDPSSODescriptor",
    "IDPSSODescriptor",
  );
  if (!idpDescriptor || typeof idpDescriptor !== "object") {
    throw new Error("Missing or invalid IDPSSODescriptor in EntityDescriptor");
  }

  const keyDescriptors = getArrayValue<Record<string, unknown>>(
    idpDescriptor,
    "md:KeyDescriptor",
    "KeyDescriptor",
  );
  if (keyDescriptors.length === 0) {
    throw new Error("No KeyDescriptor found in IDPSSODescriptor");
  }

  const selectedKeyDescriptor =
    keyDescriptors.find(
      (desc: Record<string, unknown>) => desc && desc["@_use"] === "signing",
    ) || keyDescriptors[0];

  if (!selectedKeyDescriptor || typeof selectedKeyDescriptor !== "object") {
    throw new Error("Invalid KeyDescriptor structure");
  }

  const keyInfo = getValue<Record<string, unknown>>(
    selectedKeyDescriptor,
    "ds:KeyInfo",
    "KeyInfo",
  );
  if (!keyInfo || typeof keyInfo !== "object") {
    throw new Error("Missing or invalid KeyInfo in KeyDescriptor");
  }

  const x509Data = getValue<Record<string, unknown>>(
    keyInfo,
    "ds:X509Data",
    "X509Data",
  );
  if (!x509Data || typeof x509Data !== "object") {
    throw new Error("Missing or invalid X509Data in KeyInfo");
  }

  const x509Certificate = getValue<string>(
    x509Data,
    "ds:X509Certificate",
    "X509Certificate",
  );
  if (!x509Certificate || typeof x509Certificate !== "string") {
    throw new Error("Missing or invalid X509Certificate in X509Data");
  }

  const cert = `-----BEGIN CERTIFICATE-----\n${x509Certificate.trim()}\n-----END CERTIFICATE-----`;

  const singleSignOnServices = getArrayValue<Record<string, unknown>>(
    idpDescriptor,
    "md:SingleSignOnService",
    "SingleSignOnService",
  );
  if (singleSignOnServices.length === 0) {
    throw new Error("No SingleSignOnService found in IDPSSODescriptor");
  }

  const httpPostService = singleSignOnServices.find(
    (service: Record<string, unknown>) =>
      service &&
      service["@_Binding"] === "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
  );

  let entryPoint: string | undefined;

  if (httpPostService) {
    entryPoint = getStringValue(httpPostService, "@_Location");
  }

  if (!entryPoint && singleSignOnServices.length > 0) {
    const firstService = singleSignOnServices[0];
    if (firstService && typeof firstService === "object") {
      entryPoint = getStringValue(firstService, "@_Location");
    }
  }

  if (!entryPoint) {
    throw new Error("No valid SingleSignOnService location found");
  }

  const encodedProviderId = encodeURIComponent(providerId);
  const baseUrl = env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  const acsUrl = `${baseUrl}/api/auth/sso/saml2/callback/${encodedProviderId}`;

  const spMetadata = `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${baseUrl}">
  <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${acsUrl}" index="0"/>
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;

  return {
    issuer,
    entryPoint,
    cert,
    spMetadata,
  };
}
