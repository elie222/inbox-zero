"use server";

import { z } from "zod";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withActionInstrumentation } from "./middleware";
import { revalidatePath } from "next/cache";
import { createScopedLogger } from "@/utils/logger";
import type { EmailAction, JobStatus } from "../../app/(app)/clean/types";

const logger = createScopedLogger("EmailTrainer");

// Define validation schemas
export const startEmailTrainingSchema = z.object({
  action: z.enum(["archive", "mark-read"]) as z.ZodEnum<
    [EmailAction, EmailAction]
  >,
  timeRangeInDays: z.coerce.number().int().min(1).max(365),
  labelInstructions: z.string().optional(),
});

export type StartEmailTrainingBody = z.infer<typeof startEmailTrainingSchema>;
export type StartEmailTrainingResponse = Awaited<
  ReturnType<typeof startEmailTrainingAction>
>;

// Server action to start the email training process
export const startEmailTrainingAction = withActionInstrumentation(
  "startEmailTraining",
  async (unsafeData: StartEmailTrainingBody) => {
    const session = await auth();
    const userId = session?.user.id;
    if (!userId) return { error: "Not logged in" };

    const { data, success, error } =
      startEmailTrainingSchema.safeParse(unsafeData);
    if (!success) return { error: error.message };

    try {
      // In a real implementation, we would:
      // 1. Create a job in the database to track progress
      // 2. Start a background process to handle the emails
      // 3. Return the job ID to the client for tracking

      // For now, we'll just log the request and return a mock job ID
      logger.info("Started email training", {
        userId,
        action: data.action,
        timeRangeInDays: data.timeRangeInDays,
        hasLabelInstructions: !!data.labelInstructions,
      });

      // Create a mock job entry - in a real implementation, you would have a Job model in your Prisma schema
      // For now, we'll just return a mock job ID
      const mockJobId = `job_${Date.now()}`;

      revalidatePath("/clean");
      return { jobId: mockJobId };
    } catch (err) {
      logger.error("Error starting email training", { userId, error: err });
      return { error: "Failed to start email training. Please try again." };
    }
  },
);

// Server action to get the status of an email training job
export const getEmailTrainingStatusSchema = z.object({
  jobId: z.string(),
});

export type GetEmailTrainingStatusBody = z.infer<
  typeof getEmailTrainingStatusSchema
>;
export type GetEmailTrainingStatusResponse = Awaited<
  ReturnType<typeof getEmailTrainingStatusAction>
>;

export const getEmailTrainingStatusAction = withActionInstrumentation(
  "getEmailTrainingStatus",
  async (unsafeData: GetEmailTrainingStatusBody) => {
    const session = await auth();
    const userId = session?.user.id;
    if (!userId) return { error: "Not logged in" };

    const { data, success, error } =
      getEmailTrainingStatusSchema.safeParse(unsafeData);
    if (!success) return { error: error.message };

    try {
      // In a real implementation, you would fetch the job from the database
      // For now, we'll just return a mock status

      // Mock job data
      const mockJob = {
        status: "IN_PROGRESS" as JobStatus,
        progress: 0.25,
        totalItems: 100,
        processedItems: 25,
      };

      return {
        status: mockJob.status,
        progress: mockJob.progress,
        totalEmails: mockJob.totalItems,
        processedEmails: mockJob.processedItems,
      };
    } catch (err) {
      logger.error("Error getting email training status", {
        userId,
        jobId: data.jobId,
        error: err,
      });
      return { error: "Failed to get job status. Please try again." };
    }
  },
);

// Server action to cancel an email training job
export const cancelEmailTrainingSchema = z.object({
  jobId: z.string(),
});

export type CancelEmailTrainingBody = z.infer<typeof cancelEmailTrainingSchema>;
export type CancelEmailTrainingResponse = Awaited<
  ReturnType<typeof cancelEmailTrainingAction>
>;

export const cancelEmailTrainingAction = withActionInstrumentation(
  "cancelEmailTraining",
  async (unsafeData: CancelEmailTrainingBody) => {
    const session = await auth();
    const userId = session?.user.id;
    if (!userId) return { error: "Not logged in" };

    const { data, success, error } =
      cancelEmailTrainingSchema.safeParse(unsafeData);
    if (!success) return { error: error.message };

    try {
      // In a real implementation, you would update the job in the database
      // For now, we'll just return success

      logger.info("Cancelled email training job", {
        userId,
        jobId: data.jobId,
      });

      revalidatePath("/clean");
      return { success: true };
    } catch (err) {
      logger.error("Error cancelling email training", {
        userId,
        jobId: data.jobId,
        error: err,
      });
      return { error: "Failed to cancel job. Please try again." };
    }
  },
);
