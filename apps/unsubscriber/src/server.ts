import fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { autoUnsubscribe } from "./main";
import { env } from "./env";

const server = fastify({ logger: true });

// Register CORS
if (env.CORS_ORIGIN) {
  server.register(cors, {
    origin: env.CORS_ORIGIN,
    methods: ["GET", "POST"],
  });
}

const unsubscribeSchema = z.object({
  url: z.string().url(),
});

server.get("/", async () => {
  return { status: "OK", message: "Unsubscribe service is running" };
});

server.post("/unsubscribe", async (request, reply) => {
  try {
    const { url } = unsubscribeSchema.parse(request.body);
    const success = await autoUnsubscribe(url);
    return {
      success,
      message: success
        ? "Unsubscribed successfully"
        : "Unsubscribed but confirmation not found",
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ error: "Invalid URL provided" });
    }
    server.log.error(error);
    return reply
      .status(500)
      .send({ error: "An error occurred during the unsubscribe process" });
  }
});

const start = async () => {
  try {
    const port = env.PORT;
    await server.listen({ port });
    console.log(`Server is running at http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
