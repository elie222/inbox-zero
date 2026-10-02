export function createLocalEnvironment({
  appPort,
  databasePort,
  redisPort,
  redisHttpPort,
  googlePort,
  microsoftPort,
  llmPort,
  stripePort,
  secrets,
  inherited,
}: {
  appPort: number;
  databasePort: number;
  redisPort: number;
  redisHttpPort: number;
  googlePort: number;
  microsoftPort: number;
  llmPort: number;
  stripePort: number;
  secrets: {
    database: string;
    auth: string;
    encryption: string;
    redis: string;
  };
  inherited: NodeJS.ProcessEnv;
}): Record<string, string> {
  const systemEnv: Record<string, string> = {};
  for (const key of [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TZ",
    "TERM",
    "COLORTERM",
    "NO_COLOR",
    "FORCE_COLOR",
    "SystemRoot",
    "SYSTEMROOT",
    "COMSPEC",
    "PATHEXT",
  ]) {
    const value = inherited[key];
    if (value !== undefined) systemEnv[key] = value;
  }
  const databaseUrl = new URL(
    `postgresql://127.0.0.1:${databasePort}/inboxzero_local`,
  );
  databaseUrl.username = "postgres";
  databaseUrl.password = secrets.database;

  return {
    ...systemEnv,
    NODE_ENV: "development",
    NODE_OPTIONS: "--max_old_space_size=6144",
    // Next otherwise loads the checkout's .env files, including real credentials.
    __NEXT_PROCESSED_ENV: "true",
    NEXT_PUBLIC_BASE_URL: `http://localhost:${appPort}`,
    DATABASE_URL: databaseUrl.href,
    DATABASE_URL_UNPOOLED: databaseUrl.href,
    DIRECT_URL: databaseUrl.href,
    PREVIEW_DATABASE_URL: databaseUrl.href,
    PREVIEW_DATABASE_URL_UNPOOLED: databaseUrl.href,
    AUTH_SECRET: secrets.auth,
    EMAIL_ENCRYPT_SECRET: secrets.encryption,
    EMAIL_ENCRYPT_SALT: secrets.encryption,
    API_KEY_SALT: secrets.encryption,
    INTERNAL_API_KEY: secrets.auth,
    GOOGLE_BASE_URL: `http://localhost:${googlePort}`,
    GOOGLE_CLIENT_ID: "emulate-google-client.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "emulate-google-secret",
    GOOGLE_PUBSUB_TOPIC_NAME: "local-emulator-topic",
    GOOGLE_PUBSUB_VERIFICATION_TOKEN: secrets.auth,
    MICROSOFT_BASE_URL: `http://localhost:${microsoftPort}`,
    MICROSOFT_CLIENT_ID: "emulate-microsoft-client-id",
    MICROSOFT_CLIENT_SECRET: "emulate-microsoft-secret",
    MICROSOFT_WEBHOOK_CLIENT_STATE: secrets.auth,
    DEFAULT_LLMS: "openai-compatible:emulated",
    OPENAI_COMPATIBLE_BASE_URL: `http://127.0.0.1:${llmPort}/v1`,
    REDIS_URL: `redis://127.0.0.1:${redisPort}`,
    REDIS_HTTP_URL: `http://127.0.0.1:${redisHttpPort}`,
    REDIS_HTTP_TOKEN: secrets.redis,
    STRIPE_API_BASE_URL: `http://127.0.0.1:${stripePort}`,
    STRIPE_SECRET_KEY: "emulator-stripe-key",
    STRIPE_WEBHOOK_SECRET: "whsec_emulator",
    NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS: "true",
    NEXT_PUBLIC_EMAIL_SEND_ENABLED: "true",
    NEXT_PUBLIC_CONTACTS_ENABLED: "true",
  };
}
