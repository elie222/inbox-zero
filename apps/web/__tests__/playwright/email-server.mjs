import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const messages = [];
const port = Number(process.argv[2]);

createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  response.setHeader("Content-Type", "application/json");
  if (request.method === "POST" && url.pathname === "/emails") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const message = JSON.parse(body);
    messages.push(message);
    response.end(JSON.stringify({ id: randomUUID() }));
    return;
  }
  if (request.method === "GET" && url.pathname === "/messages") {
    const to = url.searchParams.get("to");
    response.end(
      JSON.stringify(
        messages.filter((message) =>
          (Array.isArray(message.to) ? message.to : [message.to]).includes(to),
        ),
      ),
    );
    return;
  }
  response.end(JSON.stringify({ ok: true }));
}).listen(port, "127.0.0.1");
