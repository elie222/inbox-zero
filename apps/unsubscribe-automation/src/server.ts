import fastify from "fastify";
import cors from "@fastify/cors";
import { autoUnsubscribe } from "./main";
import { z } from "zod";

const server = fastify();

// Register CORS
server.register(cors, {
  origin: process.env.CORS_ORIGIN,
  methods: ["GET", "POST"],
});

const unsubscribeSchema = z.object({
  url: z.string().url(),
});

server.get("/", async (request, reply) => {
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
    const port = process.env.PORT
      ? Number.parseInt(process.env.PORT, 10)
      : 5000;
    await server.listen({ port, host: "0.0.0.0" });
    console.log(`Server is running on ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
