import { connect } from "node:net";

// Runs before receiving any job data. Detect ignored provider allowlists;
// deployment verification still covers private routes and other exposed ports.
const [brokerIp, port] = process.argv.slice(2);
const brokerReachable = await reachable(brokerIp, Number(port));
const forbiddenReachable = await Promise.all(
  ["github.com", "registry.npmjs.org", "1.1.1.1"].map((host) =>
    reachable(host, 443),
  ),
);
process.exitCode = brokerReachable && !forbiddenReachable.some(Boolean) ? 0 : 1;

function reachable(host: string, port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = connect({ host, port, family: 4 });
    const finish = (result: boolean) => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(result);
    };
    const timeout = setTimeout(() => finish(false), 3000);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}
