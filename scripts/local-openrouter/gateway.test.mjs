import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { createGateway } from "./gateway.mjs";
import { createQuota } from "./quota.mjs";

test("uses a rolling minute, including across UTC midnight", () => {
  const quota = createQuota(":memory:", { perMinute: 2, perDay: 50 });
  const now = Date.parse("2026-10-22T23:59:59Z");
  assert.equal(quota.reserve(now).allowed, true);
  assert.equal(quota.reserve(now + 1).allowed, true);
  assert.equal(quota.reserve(now + 2000).reason, "minute");
  assert.equal(quota.reserve(now + 59_999).allowed, false);
  assert.equal(quota.reserve(now + 60_000).allowed, false);
  assert.equal(quota.reserve(now + 60_001).allowed, true);
  quota.close();
});

test("a full batch rests for a minute after its last request and survives restart", () => {
  const directory=mkdtempSync(join(tmpdir(),"inbox-batch-"));
  const path=join(directory,"quota.sqlite");
  const now=Date.parse("2026-10-24T12:00:00Z");
  let quota=createQuota(path,{perMinute:20,perDay:1000});
  for(let i=0;i<20;i++) assert.equal(quota.reserve(now+i*1000).allowed,true);
  quota.close();
  quota=createQuota(path,{perMinute:20,perDay:1000});
  assert.equal(quota.reserve(now+78_999).allowed,false);
  assert.equal(quota.reserve(now+79_000).allowed,true);
  assert.equal(quota.status(now).nextResetAt,"2026-10-25T00:00:00.000Z");
  quota.close(); rmSync(directory,{recursive:true});
});

test("queued minute-limited requests wait instead of consuming failed retries", async () => {
  let reservations=0;
  let waits=0;
  const quota={status:()=>({}),reserve:()=> ++reservations===1 ? {allowed:false,reason:"minute",retryAfter:1} : {allowed:true}};
  const server=createGateway({apiKey:"test",quota,waitForMinute:true,waitImpl:async()=>{waits++;},fetchImpl:async()=>Response.json({ok:true})});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try {
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/chat/completions`,{method:"POST",headers:{Authorization:"Bearer test"},body:JSON.stringify({model:"test:free"})});
    assert.equal(response.status,200); assert.equal(waits,1);
  } finally {await new Promise(resolve=>server.close(resolve));}
});

test("slow requests still pause after every twentieth attempt", () => {
  const quota=createQuota(":memory:",{perMinute:20,perDay:1000});
  const start=Date.parse("2026-10-24T12:00:00Z");
  for(let i=0;i<20;i++) assert.equal(quota.reserve(start+i*4000).allowed,true);
  assert.equal(quota.status(start+76_000).batchUsed,20);
  assert.equal(quota.reserve(start+135_999).allowed,false);
  assert.equal(quota.reserve(start+136_000).allowed,true);
  quota.close();
});

test("daily budget survives restarts and resets at midnight UTC", () => {
  const directory = mkdtempSync(join(tmpdir(), "inbox-quota-"));
  const path = join(directory, "quota.sqlite");
  const now = Date.parse("2026-10-22T12:00:00Z");
  let quota = createQuota(path, { perMinute: 20, perDay: 2 });
  quota.reserve(now);
  quota.close();
  quota = createQuota(path, { perMinute: 20, perDay: 2 });
  assert.equal(quota.reserve(now + 60_000).allowed, true);
  assert.equal(quota.reserve(now + 120_000).reason, "daily");
  assert.equal(quota.reserve(Date.parse("2026-10-23T00:00:00Z")).allowed, true);
  quota.close();
  rmSync(directory, { recursive: true });
});

test("separate connections share reservations and upstream usage never lowers the count", () => {
  const directory = mkdtempSync(join(tmpdir(), "inbox-quota-"));
  const path = join(directory, "quota.sqlite");
  const first = createQuota(path);
  const second = createQuota(path);
  first.syncDailyFloor(49);
  second.syncDailyFloor(2);
  assert.equal(second.reserve().allowed, true);
  assert.equal(first.reserve().reason, "daily");
  first.close();
  second.close();
  rmSync(directory, { recursive: true });
});

test("rejects invalid limits", () => {
  assert.throws(() => createQuota(":memory:", { perMinute: 0, perDay: 50 }));
  assert.throws(() => createQuota(":memory:", { perMinute: 20, perDay: 1.5 }));
});

test("protects the new-mail reserve after bulk allowance is used", () => {
  const quota=createQuota(":memory:",{perMinute:20,perDay:10,newMailReserve:2});
  const now=Date.parse("2026-10-24T12:00:00Z");
  for(let i=0;i<8;i++) assert.equal(quota.reserve(now+i,"backfill").allowed,true);
  assert.equal(quota.reserve(now+10,"backfill").reason,"backfill");
  assert.equal(quota.reserve(now+11).allowed,true);
  assert.equal(quota.reserve(now+12).allowed,true);
  assert.equal(quota.reserve(now+13).reason,"daily");
  assert.equal(quota.status(now+13).backfillUsed,8);
  quota.close();
});

test("priority calls made first do not consume the bulk counter, and external usage cannot consume the reserve", () => {
  const quota=createQuota(":memory:",{perMinute:20,perDay:10,newMailReserve:2});
  const now=Date.parse("2026-10-24T12:00:00Z");
  quota.syncDailyFloor(3,now);
  assert.equal(quota.status(now).backfillRemaining,5);
  assert.equal(quota.reserve(now).allowed,true);
  for(let i=0;i<5;i++) assert.equal(quota.reserve(now+i+1,"backfill").allowed,true);
  assert.equal(quota.reserve(now+10,"backfill").reason,"backfill");
  assert.equal(quota.reserve(now+11).allowed,true);
  assert.equal(quota.status(now+11).dailyUsed,10);
  quota.close();
});

test("reserve allocation survives restart and resets at absolute UTC midnight", () => {
  const directory=mkdtempSync(join(tmpdir(),"inbox-reserve-"));
  const path=join(directory,"quota.sqlite");
  const now=Date.parse("2026-10-24T12:00:00Z");
  let quota=createQuota(path,{perMinute:20,perDay:3,newMailReserve:1});
  quota.reserve(now,"backfill");quota.reserve(now+1,"backfill");quota.close();
  quota=createQuota(path,{perMinute:20,perDay:3,newMailReserve:1});
  assert.equal(quota.reserve(now+2,"backfill").reason,"backfill");
  assert.equal(quota.reserve(Date.parse("2026-10-25T00:00:00Z"),"backfill").allowed,true);
  quota.close();rmSync(directory,{recursive:true});
});

test("gateway protects credentials and free-only budget, counts failed attempts and streams replies", async () => {
  const quota = createQuota(":memory:", { perMinute: 20, perDay: 2 });
  let calls = 0;
  const server = createGateway({
    apiKey: "test-only-key",
    quota,
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
      assert.equal(options.headers.Authorization, "Bearer test-only-key");
      if (calls === 1) throw new Error("simulated upstream failure");
      return new Response('data: {"ok":true}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  after(async () => { await new Promise((resolve) => server.close(resolve)); quota.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (body, key = "test-only-key") => fetch(`${base}/api/v1/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
  assert.equal((await send({ model: "test:free" }, "wrong")).status, 401);
  assert.equal((await send({ model: "paid-model" })).status, 403);
  assert.equal((await send({ model: "test:free", models: ["paid-fallback"] })).status, 403);
  assert.equal((await send({ model: "test:free", plugins: [{ id: "web" }] })).status, 403);
  assert.equal(quota.status().dailyUsed, 0);
  assert.equal((await send({ model: "test:free" })).status, 502);
  const streamed = await send({ model: "test:free", stream: true });
  assert.match(await streamed.text(), /data: \[DONE\]/);
  const blocked = await send({ model: "test:free" });
  assert.equal(blocked.status, 403);
  assert.match((await blocked.json()).error.message, /daily limit/);
  assert.equal(calls, 2);
});

test("concurrent HTTP requests cannot exceed the minute budget", async () => {
  const quota = createQuota(":memory:", { perMinute: 2, perDay: 50 });
  let calls = 0;
  const server = createGateway({ apiKey: "test", quota, fetchImpl: async () => { calls++; return Response.json({ ok: true }); } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/v1/chat/completions`;
    const replies = await Promise.all(Array.from({ length: 10 }, () => fetch(url, { method: "POST", headers: { Authorization: "Bearer test" }, body: JSON.stringify({ model: "test:free" }) })));
    assert.equal(replies.filter((response) => response.status === 200).length, 2);
    assert.equal(replies.filter((response) => response.status === 429).length, 8);
    assert.equal(calls, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    quota.close();
  }
});

test("the HTTP workload header protects new-mail calls after backfill stops", async () => {
  const quota=createQuota(":memory:",{perMinute:20,perDay:3,newMailReserve:1});
  let calls=0;
  const server=createGateway({apiKey:"test",quota,fetchImpl:async()=>{calls++;return Response.json({ok:true});}});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{
    const url=`http://127.0.0.1:${server.address().port}/api/v1/chat/completions`;
    const send=workload=>fetch(url,{method:"POST",headers:{Authorization:"Bearer test","x-inbox-zero-workload":workload},body:JSON.stringify({model:"test:free"})});
    assert.equal((await send("backfill")).status,200);
    assert.equal((await send("backfill")).status,200);
    const blocked=await send("backfill");
    assert.equal(blocked.status,403);
    assert.match((await blocked.json()).error.message,/protected for new mail/);
    assert.equal((await send("priority")).status,200);
    assert.equal(calls,3);
  }finally{await new Promise(resolve=>server.close(resolve));quota.close();}
});
