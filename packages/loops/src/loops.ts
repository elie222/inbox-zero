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
): Promise<{
  success: boolean;
  id?: string;
}> {
  const loops = getLoopsClient();
  if (!loops) return { success: false };
  // so we can run a/b tests with 2-6 groups easily
  const abTestId = getRandomInt(60);
  const resp = await loops.createContact({
    email,
    properties: firstName ? { firstName, abTestId } : { abTestId },
  });
  return resp;
}

export async function deleteContact(
  email: string,
): Promise<{ success: boolean }> {
  const loops = getLoopsClient();
  if (!loops) return { success: false };
  const resp = await loops.deleteContact({ email });
  return resp;
}

export async function startedTrial(
  email: string,
  tier: string,
): Promise<{ success: boolean }> {
  const loops = getLoopsClient();
  if (!loops) return { success: false };
  const resp = await loops.sendEvent({
    eventName: "upgraded",
    email,
    contactProperties: { tier },
    eventProperties: { tier },
  });
  return resp;
}

export async function completedTrial(
  email: string,
  tier: string,
): Promise<{ success: boolean }> {
  const loops = getLoopsClient();
  if (!loops) return { success: false };
  const resp = await loops.sendEvent({
    eventName: "completed_trial",
    email,
    contactProperties: { tier },
    eventProperties: { tier },
  });
  return resp;
}

export async function switchedPremiumPlan(
  email: string,
  tier: string,
): Promise<{ success: boolean }> {
  const loops = getLoopsClient();
  if (!loops) return { success: false };
  const resp = await loops.sendEvent({
    eventName: "switched_premium_plan",
    email,
    contactProperties: { tier },
    eventProperties: { tier },
  });
  return resp;
}

export async function cancelledPremium(
  email: string,
): Promise<{ success: boolean }> {
  const loops = getLoopsClient();
  if (!loops) return { success: false };
  const resp = await loops.sendEvent({
    eventName: "cancelled",
    email,
    contactProperties: { tier: "" },
  });
  return resp;
}

function getRandomInt(max: number) {
  return Math.ceil(Math.random() * max);
}
