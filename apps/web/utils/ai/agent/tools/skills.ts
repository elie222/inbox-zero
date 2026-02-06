import { tool, type InferUITool } from "ai";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import type { AgentToolContext } from "@/utils/ai/agent/types";
import { SkillStatus } from "@/generated/prisma/enums";

const getSkillSchema = z.object({
  name: z.string().min(1).describe("Skill name to load"),
});

export const getSkillTool = ({ emailAccountId, logger }: AgentToolContext) =>
  tool({
    description: "Load a skill's content by name (ACTIVE only)",
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

      if (skill.status !== SkillStatus.ACTIVE) {
        return { error: `Skill "${name}" is ${skill.status.toLowerCase()}` };
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
  status: z
    .enum([SkillStatus.DRAFT, SkillStatus.ACTIVE, SkillStatus.DEPRECATED])
    .optional()
    .describe("Lifecycle status"),
});

export const createSkillTool = ({ emailAccountId, logger }: AgentToolContext) =>
  tool({
    description: "Create a new skill",
    inputSchema: createSkillSchema,
    execute: async ({ name, description, content, status }) => {
      const log = logger.with({ tool: "createSkill" });
      log.info("Creating skill", {
        name,
        status: status ?? SkillStatus.ACTIVE,
      });

      try {
        const skill = await prisma.skill.create({
          data: {
            name,
            description,
            content,
            status: status ?? SkillStatus.ACTIVE,
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
  status: z
    .enum([SkillStatus.DRAFT, SkillStatus.ACTIVE, SkillStatus.DEPRECATED])
    .optional(),
});

export const updateSkillTool = ({ emailAccountId, logger }: AgentToolContext) =>
  tool({
    description: "Update an existing skill and bump version",
    inputSchema: updateSkillSchema,
    execute: async ({ name, description, content, status }) => {
      const log = logger.with({ tool: "updateSkill" });
      log.info("Updating skill", { name, status });

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
          status: status ?? skill.status,
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
