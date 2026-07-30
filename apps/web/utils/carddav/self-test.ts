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
    depth = "0",
  ) => {
    try {
      const response = await fetch(path, {
        method,
        headers: {
          Depth: depth,
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

  // The step Apple actually finds addressbooks with: list the home set's
  // children and look for an addressbook collection among them
  await run(
    "Home set listing",
    "PROPFIND",
    "/api/carddav/",
    `<?xml version="1.0" encoding="UTF-8"?>
<A:propfind xmlns:A="DAV:">
  <A:prop><A:resourcetype/><A:displayname/></A:prop>
</A:propfind>`,
    (response, text) => {
      if (response.status !== 207)
        return `Expected 207, got ${response.status}`;
      if (!/addressbook/i.test(text)) {
        return "No addressbook collection listed in the home set — clients will show an empty account";
      }
      return null;
    },
    "1",
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

  // iOS syncs in two moves: list the addressbook's children (Depth 1), then
  // multiget the listed hrefs. Replaying both — and comparing the counts —
  // distinguishes "nothing to sync" from "listed but not downloadable".
  const listing = await run(
    "Contacts listing",
    "PROPFIND",
    "/api/carddav/addressbook/",
    null,
    (response, text) => {
      if (response.status !== 207)
        return `Expected 207, got ${response.status}`;
      if (!text.includes("getctag")) {
        return `207 body did not arrive intact (${text.length} bytes)`;
      }
      if (extractCardHrefs(text).length === 0) {
        return "The addressbook is empty — only saved contacts sync. Save people on the Contacts page (or add them on the phone) and they'll appear.";
      }
      return null;
    },
    "1",
  );

  const cardHrefs = listing ? extractCardHrefs(listing.text) : [];

  if (cardHrefs.length > 0) {
    // Modern iOS syncs by change tracking (RFC 6578) when the server offers
    // it: an initial sync-collection REPORT must return every card plus a
    // sync-token, or the phone stores nothing and never retries.
    await run(
      "Change tracking (initial sync)",
      "REPORT",
      "/api/carddav/addressbook/",
      `<?xml version="1.0" encoding="UTF-8"?>
<d:sync-collection xmlns:d="DAV:">
  <d:sync-token/>
  <d:sync-level>1</d:sync-level>
  <d:prop><d:getetag/></d:prop>
</d:sync-collection>`,
      (response, text) => {
        if (response.status !== 207)
          return `Expected 207, got ${response.status}`;
        if (!/sync-token/i.test(text)) {
          return "The sync response is missing its sync-token — clients that sync by change tracking will treat the whole exchange as invalid";
        }
        const reported = (text.match(/<(?:\w+:)?getetag[\s>]/g) ?? []).length;
        if (reported < cardHrefs.length) {
          return `Initial sync listed ${reported} of ${cardHrefs.length} contacts — change-tracking clients will miss the rest`;
        }
        return null;
      },
    );
  }

  if (cardHrefs.length > 0) {
    await run(
      "Contacts download",
      "REPORT",
      "/api/carddav/addressbook/",
      `<?xml version="1.0" encoding="UTF-8"?>
<card:addressbook-multiget xmlns:card="urn:ietf:params:xml:ns:carddav" xmlns:d="DAV:">
  <d:prop><d:getetag/><card:address-data/></d:prop>
  ${cardHrefs.map((href) => `<d:href>${href}</d:href>`).join("\n  ")}
</card:addressbook-multiget>`,
      (response, text) => {
        if (response.status !== 207)
          return `Expected 207, got ${response.status}`;
        if (!text.includes("multistatus")) {
          return `207 body did not arrive intact (${text.length} bytes)`;
        }
        const downloaded = (text.match(/<(?:\w+:)?address-data[\s>]/g) ?? [])
          .length;
        if (downloaded < cardHrefs.length) {
          return `Listed ${cardHrefs.length} contacts but only ${downloaded} downloaded — the server is advertising cards it can't serve, so clients sync partially or not at all`;
        }
        return null;
      },
    );
  }

  return { ok: steps.every((step) => step.ok), steps };
}

// The .vcf child hrefs from a Depth-1 addressbook listing — exactly the set a
// client would echo into its multiget
function extractCardHrefs(text: string): string[] {
  return [
    ...text.matchAll(/<(?:\w+:)?href[^>]*>([^<]+\.vcf)<\/(?:\w+:)?href>/gi),
  ].map((match) => match[1]);
}
