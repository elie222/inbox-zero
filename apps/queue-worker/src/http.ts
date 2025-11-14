import fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { env } from "./env";
import { enqueue, bulkEnqueue } from "./queue";

function isAuthorized(request: FastifyRequest): boolean {
  const auth = request.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    return token === env.CRON_SECRET;
  }
  const apiKey = request.headers["x-api-key"];
  if (typeof apiKey === "string" && apiKey.length > 0) {
    return apiKey === env.CRON_SECRET;
  }
  return false;
}

async function authGuard(request: FastifyRequest, reply: FastifyReply) {
  if (!isAuthorized(request)) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
}

const enqueueOptionsSchema = z
  .object({
    deduplicationId: z.string().min(1).optional(),
    notBefore: z.number().int().optional(), // seconds since epoch
    attempts: z.number().int().min(1).max(25).optional(),
    priority: z.number().int().min(1).max(10).optional(),
    parallelism: z.number().int().min(1).max(100).optional(),
    removeOnComplete: z
      .union([z.boolean(), z.number().int().min(0)])
      .optional(),
    removeOnFail: z.union([z.boolean(), z.number().int().min(0)]).optional(),
  })
  .optional();

const enqueueRequestSchema = z.object({
  queueName: z.string().min(1),
  // QStash-style (required)
  url: z
    .string()
    .min(1)
    .refine((u) => u.startsWith("/") || /^https?:\/\//i.test(u), {
      message: "url must be absolute http(s) or start with '/'",
    }),
  body: z.unknown().optional(),
  options: enqueueOptionsSchema,
  headers: z.record(z.string()).optional(),
});

const bulkEnqueueRequestSchema = z.object({
  queueName: z.string().min(1),
  items: z
    .array(
      z.object({
        url: z
          .string()
          .min(1)
          .refine((u) => u.startsWith("/") || /^https?:\/\//i.test(u), {
            message: "url must be absolute http(s) or start with '/'",
          }),
        body: z.unknown().optional(),
        options: enqueueOptionsSchema,
        headers: z.record(z.string()).optional(),
      }),
    )
    .min(1),
});

export function buildServer(): FastifyInstance {
  const server = fastify({
    logger: { level: env.LOG_LEVEL },
  });

  server.register(cors, {
    origin: true,
    methods: ["GET", "POST"],
  });

  server.get("/health", async () => {
    return { status: "ok" };
  });

  server.post(
    "/v1/jobs",
    { preHandler: authGuard },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = enqueueRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid request", details: parsed.error.flatten() });
      }
      const body = parsed.data;
      try {
        const targetPath = body.url;
        const data = body.body;
        // Normalize options
        const dedupId = body.options?.deduplicationId;
        const delayMs = body.options?.notBefore
          ? Math.max(0, body.options.notBefore * 1000 - Date.now())
          : undefined;

        const jobId = await enqueue(
          body.queueName,
          { targetPath, payload: data, headers: body.headers },
          {
            delay: delayMs,
            parallelism: body.options?.parallelism,
            jobId: dedupId,
          },
        );
        return reply.code(200).send({ jobId });
      } catch (error) {
        return reply.code(500).send({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  server.post(
    "/v1/jobs/bulk",
    { preHandler: authGuard },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = bulkEnqueueRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid request", details: parsed.error.flatten() });
      }
      const body = parsed.data;
      try {
        const jobIds = await bulkEnqueue(
          body.queueName,
          body.items.map((item) => {
            const targetPath = item.url;
            const data = item.body;
            const dedupId = item.options?.deduplicationId;
            const delayMs = item.options?.notBefore
              ? Math.max(0, item.options.notBefore * 1000 - Date.now())
              : undefined;
            return {
              data: { targetPath, payload: data, headers: item.headers },
              options: {
                delay: delayMs,
                jobId: dedupId,
              },
            };
          }),
          {
            delay: undefined,
            parallelism: body.items[0]?.options?.parallelism,
          },
        );
        return reply.code(200).send({ jobIds });
      } catch (error) {
        return reply.code(500).send({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  return server;
}
