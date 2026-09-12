import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { z } from "zod";
import { dockerAdapter } from "./adapters/docker.ts";
import { UnsubscribeService } from "./service.ts";
import { attachServer } from "./server.ts";
import { decide } from "./model.ts";

const httpsUrl = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
});
const config = z
  .object({
    UNSUBSCRIBE_WORKER_SECRET: z.string().min(32),
    UNSUBSCRIBE_BROKER_URL: httpsUrl,
    UNSUBSCRIBE_BROKER_IP: z.ipv4(),
    UNSUBSCRIBE_TLS_KEY_FILE: z.string().min(1),
    UNSUBSCRIBE_TLS_CERT_FILE: z.string().min(1),
    UNSUBSCRIBE_PORT: z.coerce.number().int().min(1).max(65_535).default(443),
    UNSUBSCRIBE_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
    UNSUBSCRIBE_MODEL_ENDPOINT: httpsUrl,
    UNSUBSCRIBE_MODEL_API_KEY: z.string().min(1),
    UNSUBSCRIBE_MODEL: z.string().min(1),
    UNSUBSCRIBE_SANDBOX_IMAGE: z.string().min(1),
    UNSUBSCRIBE_ROUTER_IMAGE: z.string().min(1),
  })
  .parse(process.env);

const service = new UnsubscribeService({
  adapter: dockerAdapter({
    image: config.UNSUBSCRIBE_SANDBOX_IMAGE,
    routerImage: config.UNSUBSCRIBE_ROUTER_IMAGE,
  }),
  brokerUrl: config.UNSUBSCRIBE_BROKER_URL,
  brokerIp: config.UNSUBSCRIBE_BROKER_IP,
  maxConcurrent: config.UNSUBSCRIBE_CONCURRENCY,
  decide: (observation, history, signal) =>
    decide({
      observation,
      history,
      signal,
      endpoint: config.UNSUBSCRIBE_MODEL_ENDPOINT,
      apiKey: config.UNSUBSCRIBE_MODEL_API_KEY,
      model: config.UNSUBSCRIBE_MODEL,
    }),
});
const server = createServer({
  key: readFileSync(config.UNSUBSCRIBE_TLS_KEY_FILE),
  cert: readFileSync(config.UNSUBSCRIBE_TLS_CERT_FILE),
  minVersion: "TLSv1.2",
  maxHeaderSize: 8192,
});
attachServer(server, {
  service,
  apiKey: config.UNSUBSCRIBE_WORKER_SECRET,
  brokerIp: config.UNSUBSCRIBE_BROKER_IP,
});
server.listen(config.UNSUBSCRIBE_PORT);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    service.shutdown();
    server.close();
    setTimeout(() => process.exit(0), 35_000).unref();
  });
