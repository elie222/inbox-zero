import { env } from "@/env.mjs";

export function LemonScript() {
  if (!env.NEXT_PUBLIC_LEMON_STORE_ID) return null;

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.lemonSqueezyAffiliateConfig = { store: "${env.NEXT_PUBLIC_LEMON_STORE_ID}", debug: true };`,
        }}
      />
      <script src="https://lmsqueezy.com/affiliate.js" defer />
    </>
  );
}
