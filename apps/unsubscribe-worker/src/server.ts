import { timingSafeEqual } from "node:crypto";
import { connect, type Socket } from "node:net";
import type {
  IncomingMessage,
  ServerResponse,
  Server as HttpServer,
} from "node:http";
import type { Server } from "node:https";
import { jobSchema, observationSchema } from "./contracts.ts";
import { resolvePublicAddress } from "./network.ts";
import type { UnsubscribeService } from "./service.ts";

export function attachServer(
  server: Server | HttpServer,
  {
    service,
    apiKey,
    brokerIp,
  }: { service: UnsubscribeService; apiKey: string; brokerIp: string },
) {
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.maxHeadersCount = 30;
  server.on("request", async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    try {
      if (request.method !== "POST") return send(response, 404, {});
      if (request.url === "/jobs") {
        if (!equalSecret(request.headers.authorization, `Bearer ${apiKey}`))
          return send(response, 401, {});
        const job = jobSchema.parse(await readJson(request, 12_000));
        const controller = new AbortController();
        response.on("close", () => {
          if (!response.writableEnded) controller.abort();
        });
        const result = await service.execute(job, controller.signal);
        return send(response, 200, { jobId: job.jobId, ...result });
      }
      if (request.url === "/decision") {
        const token =
          request.headers.authorization?.replace(/^Bearer /, "") ?? "";
        service.authorize(token);
        const observation = observationSchema.parse(
          await readJson(request, 256_000),
        );
        return send(response, 200, await service.decision(token, observation));
      }
      send(response, 404, {});
    } catch {
      send(response, 400, { error: "Request failed" });
    }
  });

  server.on("connect", async (request, client, head) => {
    const socket = client as Socket;
    socket.on("error", () => {});
    socket.setTimeout(30_000, () => socket.destroy());
    let upstream: Socket | undefined;
    try {
      const credentials = request.headers["proxy-authorization"];
      if (typeof credentials !== "string" || !credentials.startsWith("Basic "))
        throw new Error("Unauthorized");
      const decoded = Buffer.from(credentials.slice(6), "base64").toString(
        "utf8",
      );
      if (!decoded.startsWith("job:")) throw new Error("Unauthorized");
      const token = decoded.slice(4);
      const session = service.authorize(token);
      if (++session.connections > 128 || session.sockets.size >= 64)
        throw new Error("Connection limit reached");
      const target = new URL(`https://${request.url}`);
      if (
        target.username ||
        target.password ||
        target.pathname !== "/" ||
        target.search ||
        target.hash ||
        (target.port && target.port !== "443")
      )
        throw new Error("Destination denied");
      const address = await resolvePublicAddress(target.hostname, [brokerIp]);
      service.authorize(token);
      if (session.sockets.size >= 64)
        throw new Error("Connection limit reached");
      upstream = connect({ host: address, port: 443 });
      const remote = upstream;
      session.sockets.add(socket);
      session.sockets.add(remote);
      const close = () => {
        socket.destroy();
        remote.destroy();
        session.sockets.delete(socket);
        session.sockets.delete(remote);
      };
      remote.on("error", close);
      socket.on("close", close);
      remote.on("close", close);
      socket.setTimeout(30_000, close);
      remote.setTimeout(30_000, close);
      const accountBytes = (data: Buffer) => {
        session.bytes += data.length;
        if (session.bytes > 64 * 1024 * 1024) {
          session.controller.abort();
          close();
        }
      };
      socket.on("data", accountBytes);
      remote.on("data", accountBytes);
      remote.once("connect", () => {
        try {
          service.authorize(token);
        } catch {
          close();
          return;
        }
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) {
          accountBytes(head);
          remote.write(head);
        }
        socket.pipe(remote);
        remote.pipe(socket);
      });
    } catch {
      upstream?.destroy();
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    }
  });
}

export function equalSecret(actual: string | undefined, expected: string) {
  const left = Buffer.from(actual ?? "");
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function readJson(request: IncomingMessage, limit: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("Body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: ServerResponse, status: number, body: unknown) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}
