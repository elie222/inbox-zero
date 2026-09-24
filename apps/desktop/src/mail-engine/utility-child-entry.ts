import { createUtilityChildRuntime } from "./utility-child";

const port = process.parentPort;
const runtime = createUtilityChildRuntime((message) =>
  port.postMessage(message),
);
port.on("message", (event) => {
  runtime.handle(event.data);
});
