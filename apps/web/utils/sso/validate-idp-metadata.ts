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

    const findElement = <T = Record<string, unknown>>(
      obj: Record<string, unknown> | undefined,
      localName: string,
    ): T | undefined => {
      if (!obj || typeof obj !== "object") return undefined;

      if (obj[localName]) return obj[localName] as T;

      for (const key in obj) {
        if (key.endsWith(`:${localName}`)) {
          return obj[key] as T;
        }
      }

      return undefined;
    };

    const getElementArray = <T = Record<string, unknown>>(
      obj: Record<string, unknown> | undefined,
      localName: string,
    ): T[] => {
      const element = findElement<T>(obj, localName);
      if (!element) return [];
      return Array.isArray(element) ? element : [element];
    };

    let entityDescriptor = findElement<Record<string, unknown>>(
      metadata,
      "EntityDescriptor",
    );

    if (!entityDescriptor) {
      const entitiesDescriptor = findElement<Record<string, unknown>>(
        metadata,
        "EntitiesDescriptor",
      );
      if (entitiesDescriptor) {
        const entityDescriptors = getElementArray<Record<string, unknown>>(
          entitiesDescriptor,
          "EntityDescriptor",
        );
        entityDescriptor = entityDescriptors[0];
      }
    }

    if (!entityDescriptor || !entityDescriptor["@_entityID"]) {
      return false;
    }

    const idpDescriptor = findElement<Record<string, unknown>>(
      entityDescriptor,
      "IDPSSODescriptor",
    );
    if (!idpDescriptor) {
      return false;
    }

    const keyDescriptors = getElementArray<Record<string, unknown>>(
      idpDescriptor,
      "KeyDescriptor",
    );
    if (keyDescriptors.length === 0) {
      return false;
    }

    const selectedKeyDescriptor =
      keyDescriptors.find((desc) => desc && desc["@_use"] === "signing") ||
      keyDescriptors[0];

    if (!selectedKeyDescriptor) {
      return false;
    }

    const keyInfo = findElement<Record<string, unknown>>(
      selectedKeyDescriptor,
      "KeyInfo",
    );
    if (!keyInfo) {
      return false;
    }

    const x509Data = findElement<Record<string, unknown>>(keyInfo, "X509Data");
    if (!x509Data) {
      return false;
    }

    const x509Certificate = findElement<string | string[]>(
      x509Data,
      "X509Certificate",
    );
    let certificate: string | undefined;

    if (typeof x509Certificate === "string") {
      certificate = x509Certificate.trim();
    } else if (Array.isArray(x509Certificate)) {
      certificate = x509Certificate
        .find((cert) => typeof cert === "string" && cert.trim())
        ?.trim();
    }

    if (!certificate) {
      return false;
    }

    const singleSignOnServices = getElementArray<Record<string, unknown>>(
      idpDescriptor,
      "SingleSignOnService",
    );
    if (singleSignOnServices.length === 0) {
      return false;
    }

    let entryPoint: string | undefined;

    const httpRedirectService = singleSignOnServices.find(
      (service) =>
        service &&
        service["@_Binding"] ===
          "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
    );

    if (httpRedirectService?.["@_Location"]) {
      entryPoint = httpRedirectService["@_Location"] as string;
    } else {
      const httpPostService = singleSignOnServices.find(
        (service) =>
          service &&
          service["@_Binding"] ===
            "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
      );

      if (httpPostService?.["@_Location"]) {
        entryPoint = httpPostService["@_Location"] as string;
      } else {
        // Fall back to any available service
        const anyService = singleSignOnServices.find(
          (service) => service?.["@_Location"],
        );
        entryPoint = anyService?.["@_Location"] as string | undefined;
      }
    }

    if (!entryPoint || typeof entryPoint !== "string" || !entryPoint.trim()) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
