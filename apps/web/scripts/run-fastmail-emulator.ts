import { createFastmailEmulator } from "../__tests__/emulators/fastmail";

async function main() {
  const emulator = await createFastmailEmulator(Number(process.argv[2]));
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      await emulator.close();
      process.exit(0);
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
