import { XMLParser } from "fast-xml-parser";

export function validateIdpMetadata(xml: string): boolean {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseAttributeValue: true,
      parseTagValue: true,
    });

    const metadata = parser.parse(xml);

    const entityDescriptor = metadata["md:EntityDescriptor"];
    if (!entityDescriptor || !entityDescriptor["@_entityID"]) {
      return false;
    }

    const idpDescriptor = entityDescriptor["md:IDPSSODescriptor"];
    if (!idpDescriptor) {
      return false;
    }

    const keyDescriptors = idpDescriptor["md:KeyDescriptor"];
    if (!keyDescriptors) {
      return false;
    }

    const keyDescriptorArray = Array.isArray(keyDescriptors)
      ? keyDescriptors
      : [keyDescriptors];
    const selectedKeyDescriptor =
      keyDescriptorArray.find((desc) => desc["@_use"] === "signing") ||
      keyDescriptorArray[0];

    if (!selectedKeyDescriptor) {
      return false;
    }

    const keyInfo = selectedKeyDescriptor["ds:KeyInfo"];
    if (!keyInfo) {
      return false;
    }

    const x509Data = keyInfo["ds:X509Data"];
    if (!x509Data) {
      return false;
    }

    const x509Certificate = x509Data["ds:X509Certificate"];
    if (
      !x509Certificate ||
      typeof x509Certificate !== "string" ||
      !x509Certificate.trim()
    ) {
      return false;
    }

    const singleSignOnServices = idpDescriptor["md:SingleSignOnService"];
    if (!singleSignOnServices) {
      return false;
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
    } else {
      entryPoint = singleSignOnServices["@_Location"];
    }

    if (!entryPoint || typeof entryPoint !== "string" || !entryPoint.trim()) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
