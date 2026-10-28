import { spawnSync } from "node:child_process";

export interface AwsCommandResult {
  stderr: string;
  stdout: string;
  success: boolean;
}

export function runAwsCommand(
  env: NodeJS.ProcessEnv,
  args: string[],
): AwsCommandResult {
  const result = spawnSync("aws", args, { stdio: "pipe", env });
  return {
    success: result.status === 0,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  };
}

export function parseJson<T>(
  value: string,
  errorMessage: string,
): { success: true; value: T } | { success: false; error: string } {
  try {
    return { success: true, value: JSON.parse(value) as T };
  } catch {
    return { success: false, error: errorMessage };
  }
}

export function addSsmParameterTags(
  env: NodeJS.ProcessEnv,
  appName: string,
  envName: string,
  paramName: string,
): { success: boolean; error?: string } {
  const result = runAwsCommand(env, [
    "ssm",
    "add-tags-to-resource",
    "--resource-type",
    "Parameter",
    "--resource-id",
    paramName,
    "--tags",
    `Key=copilot-application,Value=${appName}`,
    `Key=copilot-environment,Value=${envName}`,
  ]);
  if (!result.success)
    return {
      success: false,
      error: result.stderr || "Failed to tag SSM parameter",
    };
  return { success: true };
}

export function putSsmParameterWithTags(params: {
  env: NodeJS.ProcessEnv;
  appName: string;
  envName: string;
  name: string;
  value: string;
  type: "String" | "SecureString";
  errorMessage: string;
  overwrite?: boolean;
}): { success: boolean; error?: string } {
  const result = runAwsCommand(params.env, [
    "ssm",
    "put-parameter",
    "--name",
    params.name,
    "--type",
    params.type,
    "--value",
    params.value,
    ...(params.overwrite === false ? [] : ["--overwrite"]),
  ]);
  if (!result.success) {
    if (
      params.overwrite === false &&
      result.stderr.includes("(ParameterAlreadyExists)")
    ) {
      return addSsmParameterTags(
        params.env,
        params.appName,
        params.envName,
        params.name,
      );
    }
    return { success: false, error: result.stderr || params.errorMessage };
  }

  return addSsmParameterTags(
    params.env,
    params.appName,
    params.envName,
    params.name,
  );
}

export function readSecretJson<T extends Record<string, string | undefined>>(
  env: NodeJS.ProcessEnv,
  secretId: string,
  errorMessage: string,
): { success: true; secret: T } | { success: false; error: string } {
  const result = runAwsCommand(env, [
    "secretsmanager",
    "get-secret-value",
    "--secret-id",
    secretId,
    "--query",
    "SecretString",
    "--output",
    "text",
  ]);
  if (!result.success) {
    return { success: false, error: result.stderr || errorMessage };
  }

  const secretString = result.stdout.trim();
  if (!secretString) {
    return { success: false, error: errorMessage };
  }

  const parsed = parseJson<T>(secretString, errorMessage);
  if (!parsed.success) {
    return { success: false, error: parsed.error };
  }

  return { success: true, secret: parsed.value };
}
