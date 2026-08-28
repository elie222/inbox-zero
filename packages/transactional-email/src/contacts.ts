import { resend } from "./client";

export async function createContact(options: {
  email: string;
  audienceId?: string;
}) {
  if (!resend) {
    console.warn("Resend not configured");
    return;
  }
  const audienceId = process.env.RESEND_AUDIENCE_ID || options.audienceId;
  if (!audienceId) throw new Error("Missing audienceId");
  return resend.contacts.create({ email: options.email, audienceId });
}

export async function deleteContact(options: {
  email: string;
  audienceId?: string;
}) {
  if (!resend) {
    console.warn("Resend not configured");
    return;
  }
  const audienceId = process.env.RESEND_AUDIENCE_ID || options.audienceId;
  if (!audienceId) throw new Error("Missing audienceId");
  return resend.contacts.remove({ email: options.email, audienceId });
}
