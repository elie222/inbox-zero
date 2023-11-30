import LoopsClient from "loops";

let loops: LoopsClient | undefined;
function getLoopsClient(): LoopsClient | undefined {
  // if loops api key hasn't been set this package doesn't do anything
  if (!process.env.LOOPS_API_KEY) {
    console.warn("LOOPS_API_KEY is not set");
    return;
  }

  if (!loops) loops = new LoopsClient(process.env.LOOPS_API_KEY);

  return loops;
}

export async function createContact(email: string): Promise<{
  success: boolean;
  id?: string;
}> {
  const loops = getLoopsClient();
  if (!loops) return { success: false };
  const resp = await loops.createContact(email);
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
