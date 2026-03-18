#!/usr/bin/env node

import { program } from "commander";
import packageJson from "../package.json" with { type: "json" };
import { ApiClient, buildApiUrl } from "./client";
import {
  CONFIG_PATH,
  DEFAULT_BASE_URL,
  loadConfig,
  resolveRuntimeConfig,
  updateConfig,
} from "./config";
import type {
  NullableRuleResponse,
  ResponseTimeResponse,
  RuleResponse,
  RulesResponse,
  StatsByPeriodResponse,
} from "./api-types";
import { readJsonInput } from "./io";
import {
  printJson,
  printResponseTime,
  printRulesTable,
  printStatsByPeriod,
} from "./output";

type ProgramOptions = {
  apiKey?: string;
  baseUrl?: string;
};

async function main() {
  program
    .name("inbox-zero-api")
    .description(
      "CLI tool for managing Inbox Zero through the external API.\n\n" +
        "This binary is intended for bots, automation, and API-driven workflows.\n" +
        "For self-hosting and Docker setup, use `inbox-zero` instead.",
    )
    .version(packageJson.version, "-v, --version")
    .option("-k, --api-key <key>", "Inbox Zero API key")
    .option(
      "-b, --base-url <url>",
      "Optional override for self-hosted or custom API deployments",
    );

  addConfigCommands();
  addOpenApiCommand();
  addRuleCommands();
  addStatsCommands();

  await program.parseAsync(process.argv);
}

function addConfigCommands() {
  const config = program
    .command("config")
    .description("Manage local CLI config");

  config
    .command("list")
    .description("Show the stored config path and values")
    .action(() => {
      const current = loadConfig();
      printJson({
        configPath: CONFIG_PATH,
        values: {
          apiKey: current.apiKey ? "(configured)" : "(not configured)",
          baseUrl: current.baseUrl || `${DEFAULT_BASE_URL} (default)`,
        },
      });
    });

  config
    .command("get <key>")
    .description("Get a stored config value")
    .action((key: string) => {
      const current = loadConfig();
      const value = getConfigValue(current, key);
      if (key === "api-key") {
        process.stdout.write(value ? "(configured)\n" : "(not configured)\n");
        return;
      }

      process.stdout.write(`${value || "(not configured)"}\n`);
    });

  config
    .command("set <key> <value>")
    .description("Set a stored config value")
    .action((key: string, value: string) => {
      const partial = toConfigUpdate(key, value);
      updateConfig(partial);
      process.stdout.write(`Updated ${key} in ${CONFIG_PATH}\n`);
    });
}

function addOpenApiCommand() {
  program
    .command("openapi")
    .description("Fetch the live OpenAPI document")
    .option("--json", "Print JSON output")
    .action(async (options) => {
      const response = await getOpenApiDocument(
        program.optsWithGlobals() as ProgramOptions,
      );

      if (options.json) {
        printJson(response);
        return;
      }

      const title = getStringField(response, "info", "title");
      const version = getStringField(response, "info", "version");
      const paths = Object.keys(getObjectField(response, "paths"));

      process.stdout.write(`${title} (${version})\n`);
      for (const path of paths) {
        process.stdout.write(`${path}\n`);
      }
    });
}

function addRuleCommands() {
  const rules = program.command("rules").description("Manage automation rules");

  rules
    .command("list")
    .description("List rules for the scoped inbox account")
    .option("--json", "Print JSON output")
    .action(async (options) => {
      const client = createClient(program.optsWithGlobals() as ProgramOptions);
      const response = await client.get<RulesResponse>("/rules");

      if (options.json) {
        printJson(response);
        return;
      }

      printRulesTable(response.rules);
    });

  rules
    .command("get <id>")
    .description("Get a rule by ID")
    .option("--json", "Print JSON output")
    .action(async (id: string, options) => {
      const client = createClient(program.optsWithGlobals() as ProgramOptions);
      const response = await client.get<RuleResponse>(`/rules/${id}`);

      if (options.json) {
        printJson(response);
        return;
      }

      printJson(response.rule);
    });

  rules
    .command("create")
    .description("Create a rule from a JSON file or stdin")
    .requiredOption("-f, --file <path>", "Path to JSON file, or - for stdin")
    .option("--json", "Print JSON output")
    .action(async (options) => {
      const client = createClient(program.optsWithGlobals() as ProgramOptions);
      const body = await readJsonInput(options.file);
      const response = await client.post<RuleResponse>(
        "/rules",
        JSON.stringify(body),
      );

      if (options.json) {
        printJson(response);
        return;
      }

      process.stdout.write(`Created rule ${response.rule.id}\n`);
    });

  rules
    .command("update <id>")
    .description("Replace a rule from a JSON file or stdin")
    .requiredOption("-f, --file <path>", "Path to JSON file, or - for stdin")
    .option("--json", "Print JSON output")
    .action(async (id: string, options) => {
      const client = createClient(program.optsWithGlobals() as ProgramOptions);
      const body = await readJsonInput(options.file);
      const response = await client.put<NullableRuleResponse>(
        `/rules/${id}`,
        JSON.stringify(body),
      );

      if (options.json) {
        printJson(response);
        return;
      }

      if (!response.rule) {
        throw new Error(`Updated rule ${id} could not be reloaded`);
      }

      process.stdout.write(`Updated rule ${response.rule.id}\n`);
    });

  rules
    .command("delete <id>")
    .description("Delete a rule by ID")
    .action(async (id: string) => {
      const client = createClient(program.optsWithGlobals() as ProgramOptions);
      await client.delete(`/rules/${id}`);
      process.stdout.write(`Deleted rule ${id}\n`);
    });
}

function addStatsCommands() {
  const stats = program.command("stats").description("Read account analytics");

  stats
    .command("by-period")
    .description("Get email statistics grouped by period")
    .option("--period <period>", "Time bucket: day, week, month, or year")
    .option("--from-date <timestamp>", "Unix timestamp in milliseconds")
    .option("--to-date <timestamp>", "Unix timestamp in milliseconds")
    .option("--json", "Print JSON output")
    .action(async (options) => {
      const client = createClient(program.optsWithGlobals() as ProgramOptions);
      const response = await client.get<StatsByPeriodResponse>(
        "/stats/by-period",
        {
          period: options.period,
          fromDate: options.fromDate,
          toDate: options.toDate,
        },
      );

      if (options.json) {
        printJson(response);
        return;
      }

      printStatsByPeriod(response);
    });

  stats
    .command("response-time")
    .description("Get response time statistics")
    .option("--from-date <timestamp>", "Unix timestamp in milliseconds")
    .option("--to-date <timestamp>", "Unix timestamp in milliseconds")
    .option("--json", "Print JSON output")
    .action(async (options) => {
      const client = createClient(program.optsWithGlobals() as ProgramOptions);
      const response = await client.get<ResponseTimeResponse>(
        "/stats/response-time",
        {
          fromDate: options.fromDate,
          toDate: options.toDate,
        },
      );

      if (options.json) {
        printJson(response);
        return;
      }

      printResponseTime(response);
    });
}

function createClient(options: ProgramOptions) {
  const config = resolveRuntimeConfig(options);
  return new ApiClient(config);
}

async function getOpenApiDocument(options: ProgramOptions) {
  const url = buildApiUrl(resolveBaseUrl(options), "/openapi");
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

function getConfigValue(
  config: {
    apiKey?: string;
    baseUrl?: string;
  },
  key: string,
) {
  if (key === "api-key") return config.apiKey;
  if (key === "base-url") return config.baseUrl;

  throw new Error(`Unsupported config key: ${key}`);
}

function getObjectField(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};

  const field = (value as Record<string, unknown>)[key];
  if (!field || typeof field !== "object") return {};

  return field as Record<string, unknown>;
}

function getStringField(value: unknown, objectKey: string, key: string) {
  const object = getObjectField(value, objectKey);
  const field = object[key];

  return typeof field === "string" ? field : "";
}

function resolveBaseUrl(options: ProgramOptions) {
  const storedConfig = loadConfig();

  return (
    options.baseUrl ||
    process.env.INBOX_ZERO_BASE_URL ||
    storedConfig.baseUrl ||
    DEFAULT_BASE_URL
  );
}

function toConfigUpdate(key: string, value: string) {
  if (key === "api-key") return { apiKey: value };
  if (key === "base-url") return { baseUrl: value };

  throw new Error(`Unsupported config key: ${key}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
