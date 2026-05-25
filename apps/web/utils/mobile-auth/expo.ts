import { expo } from "@better-auth/expo";

// Preserve the Expo proxy/origin behavior, but omit the redirect hook that
// appends session cookies to custom-scheme callback URLs.
export function safeExpo() {
  const plugin = expo();
  const { after: _after, ...hooks } = plugin.hooks ?? {};
  return { ...plugin, hooks };
}
