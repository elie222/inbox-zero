const model = process.env.DEFAULT_LLMS?.slice("openrouter:".length);
if (!model || !process.env.OPENROUTER_API_KEY) throw new Error("Load apps/web/.env.local first");
const response = await fetch(`${process.env.OPENROUTER_BASE_URL}/chat/completions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with only the word READY." }], max_tokens: 4096, reasoning: { effort: "low" } }),
  signal: AbortSignal.timeout(120_000),
});
const result = await response.json();
console.log(JSON.stringify({ status: response.status, model: result.model, reply: result.choices?.[0]?.message?.content, error: result.error?.message }));
if (!response.ok || !result.choices?.[0]?.message?.content) process.exitCode = 1;
