// Run with: `npx tsx scripts/listSubQuantitiesLemon.ts`

// eslint-disable-next-line no-process-env
const lemonApiKey = process.env.LEMON_API_SECRET;
if (!lemonApiKey) throw new Error("No Lemon Squeezy API key provided.");

async function main() {
  const BATCH_SIZE = 100;

  for (let page = 1; page < 1000; page++) {
    const res = await fetchLemon(
      `https://api.lemonsqueezy.com/v1/subscription-items?page[number]=${page}&page[size]=${BATCH_SIZE}`,
    );

    for (const item of res.data) {
      if (item.attributes.quantity > 1) {
        console.log(
          item.attributes.quantity,
          "-",
          item.attributes.subscription_id,
        );
      }
    }

    if (res.data.length < BATCH_SIZE) break;
  }
}

async function fetchLemon(url: string) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${lemonApiKey}`,
    },
  });
  return await res.json();
}

main();
