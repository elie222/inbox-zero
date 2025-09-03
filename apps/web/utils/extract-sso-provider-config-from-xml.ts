import { XMLParser } from "fast-xml-parser";
import { env } from "@/env";

export interface SSOProviderConfig {
  issuer: string;
  entryPoint: string;
  cert: string;
  spMetadata: string;
}

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

  const entityDescriptor = metadata["md:EntityDescriptor"];
  const issuer = entityDescriptor["@_entityID"];

  const idpDescriptor = entityDescriptor["md:IDPSSODescriptor"];
  const keyDescriptors = idpDescriptor["md:KeyDescriptor"];

  const keyDescriptorArray = Array.isArray(keyDescriptors)
    ? keyDescriptors
    : [keyDescriptors];

  const selectedKeyDescriptor =
    keyDescriptorArray.find((desc) => desc["@_use"] === "signing") ||
    keyDescriptorArray[0];

  const keyInfo = selectedKeyDescriptor["ds:KeyInfo"];
  const x509Data = keyInfo["ds:X509Data"];
  const x509Certificate = x509Data["ds:X509Certificate"];

  const cert = `-----BEGIN CERTIFICATE-----\n${x509Certificate.trim()}\n-----END CERTIFICATE-----`;

  const singleSignOnServices = idpDescriptor["md:SingleSignOnService"];

  let entryPoint: string;

  if (Array.isArray(singleSignOnServices)) {
    const httpPostService = singleSignOnServices.find(
      (service) =>
        service &&
        service["@_Binding"] ===
          "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
    );
    entryPoint = httpPostService["@_Location"];
  } else {
    entryPoint = singleSignOnServices["@_Location"];
  }

  const spMetadata = `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${env.NEXT_PUBLIC_BASE_URL}">
  <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${env.NEXT_PUBLIC_BASE_URL}/api/auth/sso/saml2/callback/${providerId}" index="0"/>
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
