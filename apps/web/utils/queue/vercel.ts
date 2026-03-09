export function isVercelQueueDispatchEnabled() {
  return process.env.VERCEL === "1";
}
