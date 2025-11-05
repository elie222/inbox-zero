import { spawnSync } from "node:child_process";

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: "inherit" });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

const skip =
  process.env.SKIP_PRISMA_MIGRATE === "1" ||
  process.env.SKIP_PRISMA_MIGRATE === "true";

if (skip) {
  console.log(
    "[build] SKIP_PRISMA_MIGRATE is set — skipping prisma migrate deploy",
  );
} else {
  console.log("[build] Running prisma migrate deploy...");
  run("pnpm", ["exec", "prisma", "migrate", "deploy"]);
}

console.log("[build] Running next build...");
run("pnpm", ["exec", "next", "build"]);
