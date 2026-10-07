import { LoopsClient } from "loops";

let loops: LoopsClient | undefined;
function getLoopsClient(): LoopsClient | undefined {
  // if loops api key hasn't been set this package doesn't do anything
  if (!process.env.LOOPS_API_SECRET) {
    console.warn("LOOPS_API_SECRET is not set");
    return;
  }

  if (!loops) loops = new LoopsClient(process.env.LOOPS_API_SECRET);

  return loops;
}

export async function createContact(
  email: string,
  firstName?: string,
  provider?: string,
): Promise<{
  success: boolean;
  id?: string;
}> {
  const loops = getLoopsClient();
  if (!loops) return { success: false };
  const properties: Record<string, string | number> = {};
  if (firstName) properties.firstName = firstName;
  if (provider) properties.provider = provider;

  return await loops.createContact({ email, properties });
}

export async function deleteContact(
  email: string,
): Promise<{ success: boolean }> {
  const loops = getLoopsClient();
  if (!loops) return { success: false };
  return await loops.deleteContact({ email });
}

export async function startedTrial(
  email: string,
  tier: string,
): Promise<{ success: boolean }> {
  const loops = getLoopsClient();
  if (!loops) return { success: false };
  return await loops.sendEvent({
    eventName: "upgraded",
    email,
    contactProperties: { tier },
    eventProperties: { tier },
  });
}

export async function completedTrial(
  email: string,
  tier: string,
): Promise<{ success: boolean }> {
  const loops = getLoopsClient();
  if (!loops) return { success: false };
  return await loops.sendEvent({
    eventName: "completed_trial",
    email,
    contactProperties: { tier },
    eventProperties: { tier },
  });
}

export async function switchedPremiumPlan(
  email: string,
  tier: string,
): Promise<{ success: boolean }> {
  const loops = getLoopsClient();
  if (!loops) return { success: false };
  return await loops.sendEvent({
    eventName: "switched_premium_plan",
    email,
    contactProperties: { tier },
    eventProperties: { tier },
  });
}

export async function cancelledPremium(
  email: string,
): Promise<{ success: boolean }> {
  const loops = getLoopsClient();
  if (!loops) return { success: false };
  return await loops.sendEvent({
    eventName: "cancelled",
    email,
    contactProperties: { tier: "" },
  });
}

async function updateContactProperty(
  email: string,
  properties: Record<string, string | number | boolean>,
): Promise<{ success: boolean }> {
  const loops = getLoopsClient();
  if (!loops) return { success: false };

  return await loops.updateContact({
    email,
    properties,
  });
}

export async function updateContactRole({
  email,
  role,
}: {
  email: string;
  role: string;
}) {
  return updateContactProperty(email, { role });
}

export async function updateContactCompanySize({
  email,
  companySize,
}: {
  email: string;
  companySize: number;
}) {
  return updateContactProperty(email, { companySize });
}

// Send webhooks include these names; later engagement webhooks do not.
export async function getWorkflowName(
  workflowId: string,
): Promise<string | null> {
  const loops = getLoopsClient();
  if (!loops) return null;
  try {
    const workflow = await loops.getWorkflow(encodeURIComponent(workflowId));
    const name = workflow.name?.trim();
    return name || null;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function getCampaignName(
  campaignId: string,
): Promise<string | null> {
  const loops = getLoopsClient();
  if (!loops) return null;
  try {
    const campaign = await loops.getCampaign(encodeURIComponent(campaignId));
    const name = campaign.name?.trim();
    return name || null;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

function isNotFound(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === 404
  );
}
