import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import * as p from "@clack/prompts";

// Sign in with ChatGPT, open-source plan-usage flow. The CLI runs on the
// machine with the browser, so it hosts the 127.0.0.1 loopback callback that
// OpenAI requires and hands the resulting registration to the app via .env:
// https://developers.openai.com/siwc/token-sharing-open-source/sign-in
// Keep in sync with apps/web/utils/llms/chatgpt/oauth.ts.
const AUTH_ISSUER = "https://auth.openai.com";
const AUTHORIZE_URL = `${AUTH_ISSUER}/api/accounts/authorize`;
const TOKEN_URL = `${AUTH_ISSUER}/api/accounts/oauth/token`;
const API_RESOURCE = "https://api.openai.com/v1";
const PLAN_SCOPE = "chatgpt.tokens.use.direct";
const SCOPES = `openid profile email offline_access resource.invoke ${PLAN_SCOPE}`;
const CALLBACK_PATH = "/auth/callback";
const PREFERRED_PORT = 1455;

export type ChatGptRegistration = {
  clientId: string;
  hostId: string;
  refreshToken: string;
  email: string | null;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
};

type CallbackResult = {
  code: string | null;
  state: string | null;
  clientId: string | null;
  error: string | null;
};

export async function signInWithChatGpt({
  hostId = `urn:uuid:${randomUUID()}`,
  clientId = null,
}: {
  hostId?: string;
  clientId?: string | null;
} = {}): Promise<ChatGptRegistration> {
  const state = randomValue();
  const nonce = randomValue();
  const codeVerifier = randomValue();

  const { server, port } = await startCallbackServer();
  const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
  const authorizeUrl = buildAuthorizeUrl({
    clientId,
    hostId,
    redirectUri,
    state,
    nonce,
    codeVerifier,
  });

  p.log.info(
    `Sign in with ChatGPT in your browser. If it doesn't open, visit:\n${authorizeUrl}`,
  );
  openBrowser(authorizeUrl);

  const result = await receiveRedirect(server).finally(() => server.close());

  if (result.error) {
    throw new Error(
      result.error === "access_denied"
        ? "ChatGPT sign-in was cancelled."
        : `ChatGPT sign-in failed: ${result.error}`,
    );
  }
  if (result.state !== state) {
    throw new Error("ChatGPT sign-in could not be verified (state mismatch).");
  }
  if (!result.code) throw new Error("ChatGPT sign-in returned no code.");

  if (clientId && result.clientId && result.clientId !== clientId) {
    throw new Error("ChatGPT returned a different app registration.");
  }
  const issuedClientId = clientId ?? result.clientId;
  if (!issuedClientId) {
    throw new Error("ChatGPT sign-in did not complete app registration.");
  }

  const tokens = await exchangeCode({
    clientId: issuedClientId,
    code: result.code,
    codeVerifier,
    redirectUri,
  });
  if (!tokens.refresh_token || !tokens.id_token) {
    throw new Error("ChatGPT sign-in returned incomplete credentials.");
  }
  if (!(tokens.scope ?? "").split(" ").includes(PLAN_SCOPE)) {
    throw new Error(
      "ChatGPT plan usage was not allowed. Run the sign-in again and allow Inbox Zero to use your plan.",
    );
  }

  const claims = validateIdTokenClaims({
    idToken: tokens.id_token,
    clientId: issuedClientId,
    nonce,
  });

  return {
    clientId: issuedClientId,
    hostId,
    refreshToken: tokens.refresh_token,
    email: claims.email,
  };
}

export function buildAuthorizeUrl({
  clientId,
  hostId,
  redirectUri,
  state,
  nonce,
  codeVerifier,
}: {
  clientId: string | null;
  hostId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}): string {
  const params = new URLSearchParams({
    client_id: clientId ?? "dynamic_agent_client",
    ext_agent_host_id: hostId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    resource: API_RESOURCE,
    state,
    nonce,
    code_challenge_method: "S256",
    code_challenge: createHash("sha256")
      .update(codeVerifier)
      .digest("base64url"),
  });
  if (!clientId) params.set("agent_name_hint", "Inbox Zero");
  return `${AUTHORIZE_URL}?${params}`;
}

export function parseRedirect(value: string): CallbackResult | null {
  try {
    const params = new URL(value.trim()).searchParams;
    return {
      code: params.get("code"),
      state: params.get("state"),
      clientId: params.get("client_id"),
      error: params.get("error"),
    };
  } catch {
    return null;
  }
}

// The ID token comes straight from the token endpoint over TLS, so issuer
// checks stand in for signature validation (OpenID Connect Core 3.1.3.7).
export function validateIdTokenClaims({
  idToken,
  clientId,
  nonce,
  now = Date.now(),
}: {
  idToken: string;
  clientId: string;
  nonce: string;
  now?: number;
}): { email: string | null } {
  const payload = decodeJwtPayload(idToken);
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (
    payload.iss !== AUTH_ISSUER ||
    !audience.includes(clientId) ||
    payload.nonce !== nonce ||
    typeof payload.exp !== "number" ||
    payload.exp * 1000 < now
  ) {
    throw new Error(
      "ChatGPT sign-in could not be verified (invalid ID token).",
    );
  }
  return { email: typeof payload.email === "string" ? payload.email : null };
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  if (!payload) throw new Error("ChatGPT returned a malformed ID token.");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

async function exchangeCode(body: {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: body.clientId,
      code: body.code,
      code_verifier: body.codeVerifier,
      redirect_uri: body.redirectUri,
      resource: API_RESOURCE,
    }),
  });
  if (!response.ok) {
    throw new Error(`ChatGPT token exchange failed (HTTP ${response.status}).`);
  }
  return response.json() as Promise<TokenResponse>;
}

async function startCallbackServer(): Promise<{
  server: Server;
  port: number;
}> {
  for (const port of [PREFERRED_PORT, 0]) {
    const server = createServer();
    const listening = await new Promise<boolean>((resolve) => {
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => resolve(true));
    });
    if (!listening) continue;
    const address = server.address();
    if (address && typeof address === "object") {
      return { server, port: address.port };
    }
  }
  throw new Error("Could not start a local server for ChatGPT sign-in.");
}

// Waits for the browser to hit the loopback server, while also accepting a
// pasted redirect for when the browser runs elsewhere (e.g. setup over SSH).
async function receiveRedirect(server: Server): Promise<CallbackResult> {
  const fromBrowser = new Promise<CallbackResult>((resolve) => {
    server.on("request", (request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== CALLBACK_PATH) {
        response.writeHead(404).end();
        return;
      }
      response
        .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        .end(
          "<p>Signed in to ChatGPT. Return to the terminal to finish connecting Inbox Zero.</p>",
        );
      resolve(parseRedirect(url.toString()) as CallbackResult);
    });
  });

  const browserArrived = new AbortController();
  fromBrowser.then(() => browserArrived.abort());

  const pasted = await p.text({
    message:
      "Waiting for the browser... If the sign-in page ends on an address that won't load, paste that address here",
    signal: browserArrived.signal,
    // An `error` redirect (e.g. access_denied) is accepted so it is reported
    // as a cancelled or failed sign-in rather than an invalid paste.
    validate: (input) => {
      const redirect = parseRedirect(input ?? "");
      return redirect?.code || redirect?.error
        ? undefined
        : "Paste the full address starting with http://127.0.0.1";
    },
  });

  if (!p.isCancel(pasted)) return parseRedirect(pasted) as CallbackResult;
  if (browserArrived.signal.aborted) return fromBrowser;

  p.cancel("Setup cancelled.");
  process.exit(0);
}

function openBrowser(url: string) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "explorer"
        : "xdg-open";
  try {
    spawn(command, [url], { stdio: "ignore", detached: true })
      .on("error", () => {})
      .unref();
  } catch {
    // The URL is printed for manual use.
  }
}

function randomValue() {
  return randomBytes(32).toString("base64url");
}
