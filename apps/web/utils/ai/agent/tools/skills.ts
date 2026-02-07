import { tool, type InferUITool } from "ai";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import type { AgentToolContext } from "@/utils/ai/agent/types";

const getSkillSchema = z.object({
  name: z.string().min(1).describe("Skill name to load"),
});

export const getSkillTool = ({ emailAccountId, logger }: AgentToolContext) =>
  tool({
    description: "Load a skill's content by name (enabled only)",
    inputSchema: getSkillSchema,
    execute: async ({ name }) => {
      const log = logger.with({ tool: "getSkill" });
      log.info("Loading skill", { name });

      const skill = await prisma.skill.findUnique({
        where: { emailAccountId_name: { emailAccountId, name } },
      });

      if (!skill) {
        return { error: `Skill "${name}" not found` };
      }

      if (!skill.enabled) {
        return { error: `Skill "${name}" is disabled` };
      }

      await prisma.skill.update({
        where: { id: skill.id },
        data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
      });

      return {
        content: skill.content,
        version: skill.version,
      };
    },
  });

export type GetSkillTool = InferUITool<ReturnType<typeof getSkillTool>>;

const createSkillSchema = z.object({
  name: z.string().min(1).describe("Unique skill name"),
  description: z.string().min(1).describe("Short description"),
  content: z.string().min(1).describe("Full markdown content"),
  enabled: z.boolean().optional().describe("Whether the skill is enabled"),
});

export const createSkillTool = ({ emailAccountId, logger }: AgentToolContext) =>
  tool({
    description: "Create a new skill",
    inputSchema: createSkillSchema,
    execute: async ({ name, description, content, enabled }) => {
      const log = logger.with({ tool: "createSkill" });
      log.info("Creating skill", { name, enabled: enabled ?? true });

      try {
        const skill = await prisma.skill.create({
          data: {
            name,
            description,
            content,
            enabled: enabled ?? true,
            emailAccountId,
          },
        });

        return {
          success: true,
          skillId: skill.id,
          version: skill.version,
        };
      } catch (error) {
        if (isDuplicateError(error, "name")) {
          return { error: `Skill "${name}" already exists` };
        }

        log.error("Failed to create skill", { error });
        return { error: "Failed to create skill" };
      }
    },
  });

export type CreateSkillTool = InferUITool<ReturnType<typeof createSkillTool>>;

const updateSkillSchema = z.object({
  name: z.string().min(1).describe("Skill name to update"),
  description: z.string().min(1).optional().describe("Updated description"),
  content: z.string().min(1).describe("Updated markdown content"),
  enabled: z.boolean().optional().describe("Whether the skill is enabled"),
});

export const updateSkillTool = ({ emailAccountId, logger }: AgentToolContext) =>
  tool({
    description: "Update an existing skill and bump version",
    inputSchema: updateSkillSchema,
    execute: async ({ name, description, content, enabled }) => {
      const log = logger.with({ tool: "updateSkill" });
      log.info("Updating skill", { name, enabled });

      const skill = await prisma.skill.findUnique({
        where: { emailAccountId_name: { emailAccountId, name } },
      });

      if (!skill) {
        return { error: `Skill "${name}" not found` };
      }

      const updated = await prisma.skill.update({
        where: { id: skill.id },
        data: {
          content,
          description: description ?? skill.description,
          enabled: enabled ?? skill.enabled,
          version: skill.version + 1,
        },
      });

      return {
        success: true,
        skillId: updated.id,
        version: updated.version,
      };
    },
  });

export type UpdateSkillTool = InferUITool<ReturnType<typeof updateSkillTool>>;
