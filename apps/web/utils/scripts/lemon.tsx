import { env } from "@/env.mjs";

export function LemonScript() {
  if (!env.NEXT_PUBLIC_LEMON_STORE_ID) return null;

  console.log("Loading lemon script");

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.lemonSqueezyAffiliateConfig = {
            store: "${env.NEXT_PUBLIC_LEMON_STORE_ID}",
            debug: true,
            trackOnLoad: false,
            onReady: function (e) {
              const url = new URL(window.location.href);
              const affiliateCode = url.searchParams.get('aff');
              e.Track(affiliateCode);
            },
            onTrack: function (e) {
              console.log("onTrack", e);
            }
          };`,
        }}
      />
      <script src="https://lmsqueezy.com/affiliate.js" defer />
    </>
  );
}
