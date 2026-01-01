import { env } from "@/env";
import {
  LLM_OPERATIONS,
  type LLMOperationId,
  type ModelTier,
} from "./operations";
import { getModel, type ModelType, type SelectModel } from "./model";
import type { UserAIFields } from "./types";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("llms/resolve-model");

// Map tier names to existing ModelType for backward compatibility
const TIER_TO_MODEL_TYPE: Record<ModelTier, ModelType> = {
  reasoning: "default",
  fast: "chat",
  economy: "economy",
};

/**
 * Resolves model tier for an operation:
 * 1. Check LLM_OPERATION_OVERRIDES env var
 * 2. Fall back to registry default
 */
export function resolveModelTier(operationId: LLMOperationId): ModelTier {
  const envOverride = getEnvOverride(operationId);
  if (envOverride) {
    logger.info("Using env override for operation", {
      operationId,
      tier: envOverride,
    });
    return envOverride;
  }
  return LLM_OPERATIONS[operationId].defaultTier;
}

function getEnvOverride(operationId: LLMOperationId): ModelTier | null {
  const overrides = env.LLM_OPERATION_OVERRIDES;
  if (!overrides) return null;
  // env.ts validates that all values are valid ModelTier
  return overrides[operationId] ?? null;
}

/**
 * Get model for a named operation.
 *
 * Resolution order:
 * 1. User brings own API key → Overrides ALL operations
 * 2. LLM_OPERATION_OVERRIDES env → Per-operation tier override
 * 3. Code default in operations.ts → Default tier for operation
 * 4. Existing *_LLM_* env vars → Model for each tier
 *
 * @example
 * const model = getModelForOperation(user, "rule.create-from-prompt");
 */
export function getModelForOperation(
  userAi: UserAIFields,
  operationId: LLMOperationId,
  online = false,
): SelectModel {
  const operation = LLM_OPERATIONS[operationId];
  const tier = resolveModelTier(operationId);
  const modelType = TIER_TO_MODEL_TYPE[tier];

  logger.info("Getting model for operation", {
    operationId,
    tier,
    modelType,
    frequency: operation.frequency,
  });

  return getModel(userAi, modelType, online);
}
