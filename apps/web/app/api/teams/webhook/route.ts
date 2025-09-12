import { NextRequest, NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import crypto from "crypto";
import { env } from "@/env";

const logger = createScopedLogger("teams/webhook");

// Verify webhook signature from Microsoft
function verifyWebhookSignature(
  request: NextRequest,
  body: string
): boolean {
  const signature = request.headers.get("authorization");
  if (!signature || !env.MICROSOFT_CLIENT_SECRET) {
    return false;
  }

  // Microsoft sends the signature in the format: "HMAC <signature>"
  const signatureParts = signature.split(" ");
  if (signatureParts.length !== 2 || signatureParts[0] !== "HMAC") {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", env.MICROSOFT_CLIENT_SECRET)
    .update(body)
    .digest("base64");

  return signatureParts[1] === expectedSignature;
}

type TeamsEventType = 
  | "teamMemberAdded"
  | "teamMemberRemoved"
  | "channelCreated"
  | "channelDeleted"
  | "teamRenamed"
  | "teamDeleted"
  | "appInstalled"
  | "appUninstalled";

interface TeamsWebhookEvent {
  type: TeamsEventType;
  eventTime: string;
  tenantId: string;
  teamId?: string;
  channelId?: string;
  userId?: string;
  userDisplayName?: string;
  userEmail?: string;
  teamName?: string;
  channelName?: string;
}

export const POST = withError(async (request: NextRequest) => {
  const body = await request.text();
  
  // Verify webhook signature
  if (!verifyWebhookSignature(request, body)) {
    logger.warn("Invalid webhook signature");
    return new Response("Unauthorized", { status: 401 });
  }

  let event: TeamsWebhookEvent;
  try {
    event = JSON.parse(body);
  } catch (error) {
    logger.error("Failed to parse webhook body", { error });
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  logger.info("Received Teams webhook event", {
    type: event.type,
    tenantId: event.tenantId,
    teamId: event.teamId,
    userId: event.userId,
  });

  try {
    switch (event.type) {
      case "appInstalled":
        await handleAppInstalled(event);
        break;
      
      case "appUninstalled":
        await handleAppUninstalled(event);
        break;
      
      case "teamMemberAdded":
        await handleTeamMemberAdded(event);
        break;
      
      case "teamMemberRemoved":
        await handleTeamMemberRemoved(event);
        break;
      
      default:
        logger.info("Unhandled event type", { type: event.type });
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    logger.error("Error processing webhook", { error, event });
    throw new SafeError("Failed to process webhook");
  }
});

async function handleAppInstalled(event: TeamsWebhookEvent) {
  logger.info("Handling app installation", {
    tenantId: event.tenantId,
    userId: event.userId,
  });

  if (!event.userId || !event.userEmail) {
    logger.warn("Missing user information in app installed event");
    return;
  }

  // Find the user by email
  const user = await prisma.user.findUnique({
    where: { email: event.userEmail.toLowerCase() },
  });

  if (!user) {
    logger.warn("User not found for app installation", {
      email: event.userEmail,
    });
    return;
  }

  // Update or create Teams installation record
  await prisma.teamsInstallation.upsert({
    where: {
      tenantId_userId: {
        tenantId: event.tenantId,
        userId: user.id,
      },
    },
    update: {
      isActive: true,
      updatedAt: new Date(),
    },
    create: {
      userId: user.id,
      tenantId: event.tenantId,
      tenantName: event.teamName,
      userEmail: event.userEmail,
      isActive: true,
    },
  });

  logger.info("App installation recorded", {
    userId: user.id,
    tenantId: event.tenantId,
  });
}

async function handleAppUninstalled(event: TeamsWebhookEvent) {
  logger.info("Handling app uninstallation", {
    tenantId: event.tenantId,
    userId: event.userId,
  });

  if (!event.userId || !event.userEmail) {
    // If no user info, deactivate all installations for this tenant
    await prisma.teamsInstallation.updateMany({
      where: { tenantId: event.tenantId },
      data: { isActive: false },
    });
    return;
  }

  // Find the user by email
  const user = await prisma.user.findUnique({
    where: { email: event.userEmail.toLowerCase() },
  });

  if (!user) {
    return;
  }

  // Deactivate the installation
  await prisma.teamsInstallation.update({
    where: {
      tenantId_userId: {
        tenantId: event.tenantId,
        userId: user.id,
      },
    },
    data: {
      isActive: false,
      updatedAt: new Date(),
    },
  });

  logger.info("App uninstallation recorded", {
    userId: user.id,
    tenantId: event.tenantId,
  });
}

async function handleTeamMemberAdded(event: TeamsWebhookEvent) {
  logger.info("Team member added", {
    tenantId: event.tenantId,
    teamId: event.teamId,
    userId: event.userId,
    userEmail: event.userEmail,
  });

  // You can add logic here to handle when a new member is added to a team
  // For example, sending a welcome message or setting up default configurations
}

async function handleTeamMemberRemoved(event: TeamsWebhookEvent) {
  logger.info("Team member removed", {
    tenantId: event.tenantId,
    teamId: event.teamId,
    userId: event.userId,
    userEmail: event.userEmail,
  });

  // You can add logic here to handle when a member is removed from a team
  // For example, cleaning up team-specific data
}

// Validation endpoint for webhook URL registration
export const GET = withError(async (request: NextRequest) => {
  const validationToken = request.nextUrl.searchParams.get("validationToken");
  
  if (validationToken) {
    // This is a validation request from Microsoft
    logger.info("Webhook validation request received");
    return new Response(validationToken, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  return NextResponse.json({ status: "ok" });
});