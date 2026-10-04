export function log(message: string, fields: Record<string, unknown> = {}) {
  process.stdout.write(
    `${JSON.stringify({ time: new Date().toISOString(), service: "fastmail-eventsource", message, ...fields })}\n`,
  );
}
