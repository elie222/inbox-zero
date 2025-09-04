import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractSSOProviderConfigFromXML } from "./extract-sso-provider-config-from-xml";

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BASE_URL: "https://example.com",
  },
}));

describe("extractSSOProviderConfigFromXML", () => {
  const validIdpMetadata = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.example.com/sso"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

  const validIdpMetadataUnprefixed = `<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...</X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.example.com/sso"/>
  </IDPSSODescriptor>
</EntityDescriptor>`;

  const validIdpMetadataMultipleServices = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example.com/redirect"/>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.example.com/sso"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

  const validIdpMetadataMultipleKeys = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="encryption">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>ENCRYPTION_CERT...</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>SIGNING_CERT...</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.example.com/sso"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("successful extraction", () => {
    it("should extract SSO config from valid prefixed XML", () => {
      const result = extractSSOProviderConfigFromXML(
        validIdpMetadata,
        "test-provider",
      );

      expect(result).toEqual({
        issuer: "https://idp.example.com",
        entryPoint: "https://idp.example.com/sso",
        cert: "-----BEGIN CERTIFICATE-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END CERTIFICATE-----",
        spMetadata: expect.stringContaining("https://example.com"),
      });
      expect(result.spMetadata).toContain("test-provider");
    });

    it("should extract SSO config from valid unprefixed XML", () => {
      const result = extractSSOProviderConfigFromXML(
        validIdpMetadataUnprefixed,
        "test-provider",
      );

      expect(result).toEqual({
        issuer: "https://idp.example.com",
        entryPoint: "https://idp.example.com/sso",
        cert: "-----BEGIN CERTIFICATE-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END CERTIFICATE-----",
        spMetadata: expect.stringContaining("https://example.com"),
      });
    });

    it("should prefer HTTP-POST service when multiple services available", () => {
      const result = extractSSOProviderConfigFromXML(
        validIdpMetadataMultipleServices,
        "test-provider",
      );

      expect(result.entryPoint).toBe("https://idp.example.com/sso");
    });

    it("should prefer signing key when multiple keys available", () => {
      const result = extractSSOProviderConfigFromXML(
        validIdpMetadataMultipleKeys,
        "test-provider",
      );

      expect(result.cert).toContain("SIGNING_CERT");
      expect(result.cert).not.toContain("ENCRYPTION_CERT");
    });

    it("should fall back to first key when no signing key found", () => {
      const metadataWithoutSigning = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor>
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>FALLBACK_CERT...</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.example.com/sso"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

      const result = extractSSOProviderConfigFromXML(
        metadataWithoutSigning,
        "test-provider",
      );
      expect(result.cert).toContain("FALLBACK_CERT");
    });

    it("should fall back to first service when no HTTP-POST service found", () => {
      const metadataWithoutHttpPost = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example.com/redirect"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

      const result = extractSSOProviderConfigFromXML(
        metadataWithoutHttpPost,
        "test-provider",
      );
      expect(result.entryPoint).toBe("https://idp.example.com/redirect");
    });

    it("should properly encode providerId in ACS URL", () => {
      const result = extractSSOProviderConfigFromXML(
        validIdpMetadata,
        "test provider with spaces & special chars",
      );

      expect(result.spMetadata).toContain(
        "test%20provider%20with%20spaces%20%26%20special%20chars",
      );
    });

    it("should handle base URL with trailing slash", () => {
      vi.mocked(require("@/env")).env.NEXT_PUBLIC_BASE_URL =
        "https://example.com/";

      const result = extractSSOProviderConfigFromXML(
        validIdpMetadata,
        "test-provider",
      );

      expect(result.spMetadata).toContain(
        "https://example.com/api/auth/sso/saml2/callback/test-provider",
      );
      expect(result.spMetadata).not.toContain("https://example.com//api");
    });
  });

  describe("error cases", () => {
    it("should throw error for invalid XML", () => {
      expect(() => {
        extractSSOProviderConfigFromXML("invalid xml", "test-provider");
      }).toThrow("Failed to parse XML metadata: Invalid XML structure");
    });

    it("should throw error for null/undefined metadata", () => {
      expect(() => {
        extractSSOProviderConfigFromXML("", "test-provider");
      }).toThrow("Failed to parse XML metadata: Invalid XML structure");
    });

    it("should throw error when EntityDescriptor is missing", () => {
      const invalidMetadata = `<?xml version="1.0" encoding="UTF-8"?>
<root>
  <other>content</other>
</root>`;

      expect(() => {
        extractSSOProviderConfigFromXML(invalidMetadata, "test-provider");
      }).toThrow("Missing or invalid EntityDescriptor in SAML metadata");
    });

    it("should throw error when entityID is missing", () => {
      const invalidMetadata = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.example.com/sso"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

      expect(() => {
        extractSSOProviderConfigFromXML(invalidMetadata, "test-provider");
      }).toThrow("Missing or invalid entityID in EntityDescriptor");
    });

    it("should throw error when IDPSSODescriptor is missing", () => {
      const invalidMetadata = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com">
</md:EntityDescriptor>`;

      expect(() => {
        extractSSOProviderConfigFromXML(invalidMetadata, "test-provider");
      }).toThrow("Missing or invalid IDPSSODescriptor in EntityDescriptor");
    });

    it("should throw error when KeyDescriptor is missing", () => {
      const invalidMetadata = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.example.com/sso"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

      expect(() => {
        extractSSOProviderConfigFromXML(invalidMetadata, "test-provider");
      }).toThrow("No KeyDescriptor found in IDPSSODescriptor");
    });

    it("should throw error when KeyInfo is missing", () => {
      const invalidMetadata = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
    </md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.example.com/sso"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

      expect(() => {
        extractSSOProviderConfigFromXML(invalidMetadata, "test-provider");
      }).toThrow("Missing or invalid KeyInfo in KeyDescriptor");
    });

    it("should throw error when X509Data is missing", () => {
      const invalidMetadata = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.example.com/sso"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

      expect(() => {
        extractSSOProviderConfigFromXML(invalidMetadata, "test-provider");
      }).toThrow("Missing or invalid X509Data in KeyInfo");
    });

    it("should throw error when X509Certificate is missing", () => {
      const invalidMetadata = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.example.com/sso"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

      expect(() => {
        extractSSOProviderConfigFromXML(invalidMetadata, "test-provider");
      }).toThrow("Missing or invalid X509Certificate in X509Data");
    });

    it("should throw error when SingleSignOnService is missing", () => {
      const invalidMetadata = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

      expect(() => {
        extractSSOProviderConfigFromXML(invalidMetadata, "test-provider");
      }).toThrow("No SingleSignOnService found in IDPSSODescriptor");
    });

    it("should throw error when no valid service location found", () => {
      const invalidMetadata = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

      expect(() => {
        extractSSOProviderConfigFromXML(invalidMetadata, "test-provider");
      }).toThrow("No valid SingleSignOnService location found");
    });
  });

  describe("edge cases", () => {
    it("should handle certificate with whitespace", () => {
      const metadataWithWhitespace = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>  MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...  </ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.example.com/sso"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

      const result = extractSSOProviderConfigFromXML(
        metadataWithWhitespace,
        "test-provider",
      );
      expect(result.cert).toBe(
        "-----BEGIN CERTIFICATE-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END CERTIFICATE-----",
      );
    });

    it("should handle mixed namespace formats", () => {
      const mixedNamespaceMetadata = `<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com">
  <md:IDPSSODescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <ds:X509Certificate>MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...</ds:X509Certificate>
        </X509Data>
      </ds:KeyInfo>
    </KeyDescriptor>
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.example.com/sso"/>
  </md:IDPSSODescriptor>
</EntityDescriptor>`;

      const result = extractSSOProviderConfigFromXML(
        mixedNamespaceMetadata,
        "test-provider",
      );
      expect(result.issuer).toBe("https://idp.example.com");
      expect(result.entryPoint).toBe("https://idp.example.com/sso");
    });
  });
});
