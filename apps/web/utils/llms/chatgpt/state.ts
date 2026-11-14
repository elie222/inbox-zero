import { decryptToken, encryptToken } from "@/utils/encryption";

const STATE_TTL_MS = 10 * 60 * 1000;

// The callback lands on 127.0.0.1 while the admin browses on the configured
// base URL (usually localhost), so cookies set when starting the flow are not
// sent back. The PKCE verifier and nonce travel encrypted in `state` instead.
type ChatGptOAuthState = {
  clientId: string | null;
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
  userId: string;
};

export function encodeChatGptState(state: ChatGptOAuthState): string {
  const encrypted = encryptToken(
    JSON.stringify({ ...state, expiresAt: Date.now() + STATE_TTL_MS }),
  );
  if (!encrypted) throw new Error("Failed to encrypt ChatGPT OAuth state");
  return encrypted;
}

export function decodeChatGptState(
  value: string | null,
): ChatGptOAuthState | null {
  if (!value) return null;
  try {
    const decrypted = decryptToken(value);
    if (!decrypted || decrypted === value) return null;
    const parsed = JSON.parse(decrypted) as ChatGptOAuthState & {
      expiresAt?: number;
    };
    if (!parsed.expiresAt || parsed.expiresAt < Date.now()) return null;
    const { expiresAt: _expiresAt, ...state } = parsed;
    return state;
  } catch {
    return null;
  }
}
