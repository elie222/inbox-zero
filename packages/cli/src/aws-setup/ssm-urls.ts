import {
  parseJson,
  putSsmParameterWithTags,
  readSecretJson,
  runAwsCommand,
} from "./aws-cli";

export function ensureDatabaseUrlParameters(
  appName: string,
  envName: string,
  env: NodeJS.ProcessEnv,
): { success: boolean; error?: string } {
  const dbInstanceId = `${appName}-${envName}-db`;
  const secretId = `${appName}-${envName}-db-credentials`;
  const endpointResult = runAwsCommand(env, [
    "rds",
    "describe-db-instances",
    "--db-instance-identifier",
    dbInstanceId,
    "--query",
    "DBInstances[0].Endpoint",
    "--output",
    "json",
  ]);
  if (!endpointResult.success) {
    return {
      success: false,
      error: endpointResult.stderr || "Failed to read database endpoint",
    };
  }

  const endpointParsed = parseJson<{
    Address?: string;
    Port?: number;
  } | null>(endpointResult.stdout, "Failed to parse database endpoint");
  if (!endpointParsed.success) {
    return { success: false, error: endpointParsed.error };
  }

  const endpoint = endpointParsed.value;
  if (!endpoint) {
    return { success: false, error: "Database endpoint not available" };
  }
  if (!endpoint.Address || !endpoint.Port) {
    return { success: false, error: "Database endpoint not available" };
  }

  const secretResult = readSecretJson<{
    username?: string;
    password?: string;
  }>(env, secretId, "Failed to read database credentials");
  if (!secretResult.success) {
    return { success: false, error: secretResult.error };
  }

  const secret = secretResult.secret;
  if (!secret.password) {
    return { success: false, error: "Database password missing in secret" };
  }

  const dbUrl = buildDatabaseUrl({
    username: secret.username || "inboxzero",
    password: secret.password,
    endpoint: endpoint.Address,
    port: endpoint.Port,
    database: "inboxzero",
  });

  const paramNames = [
    `/copilot/${appName}/${envName}/secrets/DATABASE_URL`,
    `/copilot/${appName}/${envName}/secrets/DIRECT_URL`,
  ];

  for (const paramName of paramNames) {
    const putResult = putSsmParameterWithTags({
      env,
      appName,
      envName,
      name: paramName,
      value: dbUrl,
      type: "SecureString",
      errorMessage: "Failed to write DB URL parameter",
    });
    if (!putResult.success) {
      return {
        success: false,
        error: putResult.error,
      };
    }
  }

  return { success: true };
}

export function ensureRedisUrlParameter(
  appName: string,
  envName: string,
  env: NodeJS.ProcessEnv,
): { success: boolean; error?: string } {
  const replicationGroupId = `${appName}-${envName}-redis`;
  const endpointResult = runAwsCommand(env, [
    "elasticache",
    "describe-replication-groups",
    "--replication-group-id",
    replicationGroupId,
    "--query",
    "ReplicationGroups[0].NodeGroups[0].PrimaryEndpoint.Address",
    "--output",
    "text",
  ]);
  if (!endpointResult.success) {
    return {
      success: false,
      error: endpointResult.stderr || "Failed to read Redis endpoint",
    };
  }

  const endpoint = endpointResult.stdout.trim();
  if (!endpoint) {
    return { success: false, error: "Redis endpoint not available" };
  }

  const secretId = `${appName}-${envName}-redis-auth-token`;
  const secretResult = readSecretJson<{ password?: string }>(
    env,
    secretId,
    "Failed to read Redis auth token",
  );
  if (!secretResult.success) {
    return { success: false, error: secretResult.error };
  }

  const secret = secretResult.secret;
  if (!secret.password) {
    return { success: false, error: "Redis auth token missing in secret" };
  }

  const redisUrl = buildRedisUrl({
    password: secret.password,
    endpoint,
    port: 6379,
  });

  const paramName = `/copilot/${appName}/${envName}/secrets/REDIS_URL`;
  const putResult = putSsmParameterWithTags({
    env,
    appName,
    envName,
    name: paramName,
    value: redisUrl,
    type: "SecureString",
    errorMessage: "Failed to write Redis URL parameter",
  });
  if (!putResult.success) {
    return {
      success: false,
      error: putResult.error,
    };
  }

  return { success: true };
}

export function buildDatabaseUrl(params: {
  username: string;
  password: string;
  endpoint: string;
  port: number;
  database: string;
}): string {
  const username = encodeURIComponent(params.username);
  const password = encodeURIComponent(params.password);
  return `postgresql://${username}:${password}@${params.endpoint}:${params.port}/${params.database}`;
}

export function buildRedisUrl(params: {
  password: string;
  endpoint: string;
  port: number;
}): string {
  const password = encodeURIComponent(params.password);
  return `rediss://:${password}@${params.endpoint}:${params.port}`;
}
