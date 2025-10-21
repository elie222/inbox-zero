import { NextResponse } from "next/server";
import { createScopedLogger } from "@/utils/logger";
import type { CleanAction } from "@prisma/client";

const logger = createScopedLogger("queue-handlers");

export interface DigestJobData {
  emailAccountId: string;
  actionId?: string;
  coldEmailId?: string;
  message: {
    id: string;
    threadId: string;
    from: string;
    to: string;
    subject: string;
    content: string;
  };
}

export interface AiCategorizeSendersJobData {
  emailAccountId: string;
  senders: string[];
}

export interface ScheduledActionJobData {
  scheduledActionId: string;
}

export interface AiCleanJobData {
  emailAccountId: string;
  threadId: string;
  markedDoneLabelId: string;
  processedLabelId: string;
  jobId: string;
  action: CleanAction;
  instructions?: string;
  skips: {
    reply: boolean;
    starred: boolean;
    calendar: boolean;
    receipt: boolean;
    attachment: boolean;
    conversation: boolean;
  };
}

export interface EmailDigestAllJobData {
  emailAccountId: string;
}

export interface EmailSummaryAllJobData {
  email: string;
  userId: string;
}

export interface CleanGmailJobData {
  emailAccountId: string;
  threadId: string;
  markDone: boolean;
  action: CleanAction;
  markedDoneLabelId?: string;
  processedLabelId?: string;
  jobId: string;
}

async function handleDigestJob(data: DigestJobData) {
  logger.info("Processing digest job", {
    emailAccountId: data.emailAccountId,
    actionId: data.actionId,
    coldEmailId: data.coldEmailId,
    messageId: data.message.id,
  });

  // TODO: Implement actual digest processing logic
  await new Promise((resolve) => setTimeout(resolve, 1000));

  logger.info("Digest job completed");
  return NextResponse.json({ success: true });
}

async function handleCategorizeSendersJob(data: AiCategorizeSendersJobData) {
  logger.info("Processing categorize senders job", {
    emailAccountId: data.emailAccountId,
    senderCount: data.senders.length,
  });

  // TODO: Implement actual categorization logic
  await new Promise((resolve) => setTimeout(resolve, 2000));

  logger.info("Categorize senders job completed");
  return NextResponse.json({ success: true });
}

async function handleScheduledActionJob(data: ScheduledActionJobData) {
  logger.info("Processing scheduled action job", {
    scheduledActionId: data.scheduledActionId,
  });

  // TODO: Implement actual scheduled action logic
  await new Promise((resolve) => setTimeout(resolve, 500));

  logger.info("Scheduled action job completed");
  return NextResponse.json({ success: true });
}

async function handleAiCleanJob(data: AiCleanJobData) {
  logger.info("Processing AI clean job", {
    emailAccountId: data.emailAccountId,
    threadId: data.threadId,
    action: data.action,
    jobId: data.jobId,
  });

  // TODO: Implement actual AI clean logic
  await new Promise((resolve) => setTimeout(resolve, 3000));

  logger.info("AI clean job completed");
  return NextResponse.json({ success: true });
}

async function handleEmailDigestAllJob(data: EmailDigestAllJobData) {
  logger.info("Processing email digest all job", {
    emailAccountId: data.emailAccountId,
  });

  // TODO: Implement actual email digest all logic
  await new Promise((resolve) => setTimeout(resolve, 1500));

  logger.info("Email digest all job completed");
  return NextResponse.json({ success: true });
}

async function handleEmailSummaryAllJob(data: EmailSummaryAllJobData) {
  logger.info("Processing email summary all job", {
    email: data.email,
    userId: data.userId,
  });

  // TODO: Implement actual email summary all logic
  await new Promise((resolve) => setTimeout(resolve, 2500));

  logger.info("Email summary all job completed");
  return NextResponse.json({ success: true });
}

async function handleCleanGmailJob(data: CleanGmailJobData) {
  logger.info("Processing clean Gmail job", {
    emailAccountId: data.emailAccountId,
    threadId: data.threadId,
    jobId: data.jobId,
  });

  // TODO: Implement actual clean Gmail logic
  await new Promise((resolve) => setTimeout(resolve, 2000));

  logger.info("Clean Gmail job completed");
  return NextResponse.json({ success: true });
}

export const QUEUE_HANDLERS = {
  "digest-item-summarize": handleDigestJob,
  "ai-categorize-senders": handleCategorizeSendersJob,
  "scheduled-actions": handleScheduledActionJob,
  "ai-clean": handleAiCleanJob,
  "email-digest-all": handleEmailDigestAllJob,
  "email-summary-all": handleEmailSummaryAllJob,
  "clean-gmail": handleCleanGmailJob,
} as const;

export type QueueName = keyof typeof QUEUE_HANDLERS;
export function getQueueHandler(queueName: string) {
  return QUEUE_HANDLERS[queueName as QueueName] || null;
}

export function isValidQueueName(queueName: string): queueName is QueueName {
  return queueName in QUEUE_HANDLERS;
}
