import { XMLParser } from "fast-xml-parser";

export function validateAndExtractUserInfoFromSAML(
  samlResponseXml: string,
  expectedCert: string,
): { email: string; name: string; [key: string]: any } {
  try {
    if (!validateSAMLCertificate(samlResponseXml, expectedCert)) {
      throw new Error("SAML certificate validation failed");
    }

    const parsedSAML = parseSAMLResponse(samlResponseXml);

    const response =
      parsedSAML?.["saml2p:Response"] || parsedSAML?.["samlp:Response"];
    if (!response) {
      throw new Error("No SAML Response found");
    }

    const assertion = response["saml2:Assertion"] || response["saml:Assertion"];
    if (!assertion) {
      throw new Error("No SAML Assertion found");
    }

    const subject = assertion["saml2:Subject"] || assertion["saml:Subject"];
    const attributeStatement =
      assertion["saml2:AttributeStatement"] ||
      assertion["saml:AttributeStatement"];

    let email = "";
    let name = "";
    const extraFields: Record<string, any> = {};

    const nameID = subject?.["saml2:NameID"] || subject?.["saml:NameID"];
    if (nameID) {
      email = nameID["#text"] || nameID;
    }

    if (attributeStatement) {
      const attributes =
        attributeStatement["saml2:Attribute"] ||
        attributeStatement["saml:Attribute"];
      if (attributes) {
        const attrArray = Array.isArray(attributes) ? attributes : [attributes];

        for (const attr of attrArray) {
          const attrName = attr["@_Name"];
          const attrValues =
            attr["saml2:AttributeValue"] || attr["saml:AttributeValue"];

          if (attrValues) {
            const values = Array.isArray(attrValues)
              ? attrValues
              : [attrValues];
            const value = values[0]["#text"] || values[0];

            switch (attrName) {
              case "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress":
              case "email":
              case "Email":
                email = value;
                break;
              case "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name":
              case "name":
              case "Name":
              case "displayName":
                name = value;
                break;
              case "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname":
              case "firstName":
                extraFields.firstName = value;
                break;
              case "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname":
              case "lastName":
                extraFields.lastName = value;
                break;
              case "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/department":
              case "department":
                extraFields.department = value;
                break;
              case "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/role":
              case "role":
                extraFields.role = value;
                break;
              default:
                extraFields[attrName] = value;
            }
          }
        }
      }
    }

    if (!name && email) {
      name = email.split("@")[0];
    }

    if (!email) {
      throw new Error("Could not extract email from SAML response");
    }

    return { email, name, ...extraFields };
  } catch (error) {
    throw new Error(
      `Failed to extract user information: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function extractX509CertificateRobust(xmlString: string): {
  raw: string;
  pem: string;
} {
  const options = {
    ignoreAttributes: false,
    parseAttributeValue: false,
    trimValues: true,
    ignoreNameSpace: true,
    parseTagValue: false,
    arrayMode: (name: string) => {
      if (name === "Signature" || name === "X509Certificate") {
        return true;
      }
      return false;
    },
  };

  const parser = new XMLParser(options);
  const parsedXml = parser.parse(xmlString);

  function findX509Certificate(obj: any): string | null {
    if (typeof obj !== "object" || obj === null) return null;

    if (obj.X509Certificate) {
      const cert = obj.X509Certificate;
      return Array.isArray(cert) ? cert[0] : cert;
    }

    for (const key in obj) {
      if (Object.hasOwn(obj, key)) {
        const result = findX509Certificate(obj[key]);
        if (result) return result;
      }
    }

    return null;
  }

  const certificate = findX509Certificate(parsedXml);

  if (!certificate) {
    throw new Error("No X509Certificate found in SAML response");
  }

  const rawCertData = certificate.replace(/\s/g, "");
  const pemCert = `-----BEGIN CERTIFICATE-----\n${rawCertData.match(/.{1,64}/g)?.join("\n")}\n-----END CERTIFICATE-----`;

  return {
    raw: rawCertData,
    pem: pemCert,
  };
}

export function validateSAMLCertificate(
  samlResponseXml: string,
  expectedCert: string,
): boolean {
  try {
    const extractedCert = extractX509CertificateRobust(samlResponseXml);

    const cleanExpectedCert = expectedCert
      .replace(/-----BEGIN CERTIFICATE-----/g, "")
      .replace(/-----END CERTIFICATE-----/g, "")
      .replace(/\s/g, "");

    const cleanExtractedCert = extractedCert.raw;

    return cleanExpectedCert === cleanExtractedCert;
  } catch (error) {
    return false;
  }
}

export function parseSAMLResponse(samlResponseXml: string): any {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    parseAttributeValue: true,
  });

  try {
    return parser.parse(samlResponseXml);
  } catch (parseError) {
    throw new Error("Invalid SAML response format");
  }
}
