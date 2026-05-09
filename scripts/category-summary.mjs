import { readFileSync } from "node:fs";
const data = JSON.parse(readFileSync("./scripts/cat-results.json", "utf8"));

// Invert: per Gmail category, distribution of internal rules.
const byCategory = {};
let total = 0;
for (const [rule, cats] of Object.entries(data.tally)) {
  for (const [cat, n] of Object.entries(cats)) {
    byCategory[cat] ??= { total: 0, rules: {} };
    byCategory[cat].rules[rule] = (byCategory[cat].rules[rule] ?? 0) + n;
    byCategory[cat].total += n;
    total += n;
  }
}

console.log(`Total classified emails (last 30d): ${total}\n`);
console.log("=== Per Gmail-category breakdown (precision) ===\n");
const order = ["CATEGORY_PROMOTIONS", "CATEGORY_PURCHASES", "CATEGORY_SOCIAL", "CATEGORY_FORUMS", "CATEGORY_UPDATES", "CATEGORY_PERSONAL", "<none>"];
for (const cat of order) {
  const entry = byCategory[cat];
  if (!entry) continue;
  const pct = ((entry.total / total) * 100).toFixed(1);
  console.log(`${cat}  (${entry.total} emails, ${pct}% of total)`);
  const sorted = Object.entries(entry.rules).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const topPct = ((top[1] / entry.total) * 100).toFixed(1);
  for (const [rule, n] of sorted) {
    const p = ((n / entry.total) * 100).toFixed(1);
    console.log(`  ${rule.padEnd(14)} ${n.toString().padStart(4)}  ${p.padStart(5)}%`);
  }
  console.log(`  → dominant rule: ${top[0]} at ${topPct}%\n`);
}

// Clean-route coverage: if we treat each Gmail category as routing to its dominant rule,
// what's the precision and how many LLM calls do we skip?
// Caveat: we don't actually know which of these went through the LLM vs static rules.
// Treat as upper bound.
console.log("=== Clean-route hypothesis (Gmail category → dominant rule) ===\n");
const proposedRouting = {
  CATEGORY_PROMOTIONS: "Marketing",
  CATEGORY_PURCHASES: "Receipts",  // not in data but per user's sampling
  // SOCIAL, FORUMS, UPDATES, PERSONAL: ambiguous — would still need LLM
};
let cleanRouted = 0;
let cleanCorrect = 0;
let llmDeferred = 0;
for (const [cat, entry] of Object.entries(byCategory)) {
  if (proposedRouting[cat]) {
    cleanRouted += entry.total;
    cleanCorrect += entry.rules[proposedRouting[cat]] ?? 0;
  } else {
    llmDeferred += entry.total;
  }
}
console.log(`Clean-routed (Promotions→Marketing only):  ${cleanRouted} (${((cleanRouted / total) * 100).toFixed(1)}% of all classified)`);
console.log(`  precision: ${cleanCorrect}/${cleanRouted} = ${((cleanCorrect / cleanRouted) * 100).toFixed(1)}%`);
console.log(`  miscategorized: ${cleanRouted - cleanCorrect}`);
console.log(`Deferred to LLM (everything else):         ${llmDeferred} (${((llmDeferred / total) * 100).toFixed(1)}%)`);
