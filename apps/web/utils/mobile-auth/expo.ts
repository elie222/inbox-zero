import { expo } from "@better-auth/expo";

export function safeExpo() {
  const plugin = expo();

  // Preserve the Expo proxy/origin behavior, but omit the redirect hook that
  // appends session cookies to custom-scheme callback URLs.
  return {
    id: plugin.id,
    version: plugin.version,
    init: plugin.init,
    onRequest: plugin.onRequest,
    endpoints: plugin.endpoints,
    options: plugin.options,
  };
}
