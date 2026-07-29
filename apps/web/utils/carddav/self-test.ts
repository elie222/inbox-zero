// Replays the CardDAV conversation iOS runs at account setup, from the
// browser, against the same origin. Runs on the real transport — through the
// PROPFIND/REPORT tunnel — so it answers the question server logs can't:
// what does a client actually receive?

export type SelfTestStep = {
  name: string;
  method: string;
  path: string;
  ok: boolean;
  status: number | null;
  contentType: string | null;
  bodyBytes: number | null;
  // What made the step fail, in words a bug report can use
  problem: string | null;
};

export type SelfTestResult = {
  ok: boolean;
  steps: SelfTestStep[];
};

// iOS's first request, verbatim (accountsd sends exactly these three props)
const DISCOVERY_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<A:propfind xmlns:A="DAV:">
  <A:prop>
    <A:current-user-principal/>
    <A:principal-URL/>
    <A:resourcetype/>
  </A:prop>
</A:propfind>`;

const PRINCIPAL_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<A:propfind xmlns:A="DAV:">
  <A:prop>
    <A:addressbook-home-set xmlns:A="urn:ietf:params:xml:ns:carddav"/>
    <A:displayname/>
  </A:prop>
</A:propfind>`;

export async function runCarddavSelfTest({
  email,
  password,
}: {
  email: string;
  // Without a password the test still proves whether tunneled responses
  // arrive: the 401 must carry its challenge header and body
  password: string | null;
}): Promise<SelfTestResult> {
  const auth = password ? `Basic ${btoa(`${email}:${password}`)}` : null;

  const steps: SelfTestStep[] = [];
  const run = async (
    name: string,
    method: string,
    path: string,
    body: string | null,
    expect: (response: Response, text: string) => string | null,
  ) => {
    try {
      const response = await fetch(path, {
        method,
        headers: {
          Depth: "0",
          "Content-Type": "application/xml",
          ...(auth ? { Authorization: auth } : {}),
        },
        ...(body ? { body } : {}),
        cache: "no-store",
      });
      const text = await response.text();
      const problem = expect(response, text);
      steps.push({
        name,
        method,
        path,
        ok: !problem,
        status: response.status,
        contentType: response.headers.get("content-type"),
        bodyBytes: text.length,
        problem,
      });
      return { response, text };
    } catch (error) {
      steps.push({
        name,
        method,
        path,
        ok: false,
        status: null,
        contentType: null,
        bodyBytes: null,
        problem: `Request failed before a response arrived: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      return null;
    }
  };

  await run("Capability probe", "OPTIONS", "/api/carddav", null, (response) => {
    if (response.status !== 200) return `Expected 200, got ${response.status}`;
    if (!response.headers.get("dav")?.includes("addressbook")) {
      return "DAV header missing addressbook compliance";
    }
    return null;
  });

  if (!auth) {
    // The unauthenticated tunnel check: the 401 must arrive with its
    // challenge and its body, or clients can never even start
    await run(
      "Tunnel delivery (unauthenticated)",
      "PROPFIND",
      "/api/carddav",
      DISCOVERY_BODY,
      (response, text) => {
        if (response.status !== 401) {
          return `Expected 401, got ${response.status}`;
        }
        if (!response.headers.get("www-authenticate")) {
          return "401 arrived without its WWW-Authenticate challenge";
        }
        if (!text.includes("Unauthorized")) {
          return `401 body did not arrive intact (${text.length} bytes)`;
        }
        return null;
      },
    );
    return { ok: steps.every((step) => step.ok), steps };
  }

  await run(
    "Principal discovery",
    "PROPFIND",
    "/api/carddav",
    DISCOVERY_BODY,
    (response, text) => {
      if (response.status !== 207) {
        return `Expected 207, got ${response.status}${
          response.status === 401 ? " — wrong email or password" : ""
        }`;
      }
      if (!text.includes("current-user-principal")) {
        return `207 body did not arrive intact (${text.length} bytes)`;
      }
      return null;
    },
  );

  await run(
    "Addressbook home discovery",
    "PROPFIND",
    "/api/carddav/principal",
    PRINCIPAL_BODY,
    (response, text) => {
      if (response.status !== 207)
        return `Expected 207, got ${response.status}`;
      if (!text.includes("addressbook-home-set")) {
        return `207 body did not arrive intact (${text.length} bytes)`;
      }
      return null;
    },
  );

  await run(
    "Addressbook probe",
    "PROPFIND",
    "/api/carddav/addressbook/",
    null,
    (response, text) => {
      if (response.status !== 207)
        return `Expected 207, got ${response.status}`;
      if (!text.includes("getctag")) {
        return `207 body did not arrive intact (${text.length} bytes)`;
      }
      return null;
    },
  );

  await run(
    "Contacts download",
    "REPORT",
    "/api/carddav/addressbook/",
    `<?xml version="1.0" encoding="UTF-8"?>
<card:addressbook-query xmlns:card="urn:ietf:params:xml:ns:carddav" xmlns:d="DAV:">
  <d:prop><d:getetag/><card:address-data/></d:prop>
</card:addressbook-query>`,
    (response, text) => {
      if (response.status !== 207)
        return `Expected 207, got ${response.status}`;
      if (!text.includes("multistatus")) {
        return `207 body did not arrive intact (${text.length} bytes)`;
      }
      return null;
    },
  );

  return { ok: steps.every((step) => step.ok), steps };
}
