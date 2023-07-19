// This will be a user setting in the future
export const generalPrompt = `
I am the CEO of a company called ShareMint. We're a web3 affiliate marketing platform.

Some rules to follow:
* Be friendly, concise, and professional, but not overly formal.
* Draft responses of 1-3 sentences when necessary.
* Add the newsletter label to emails that are newsletters.
* Draft responses to snoozed emails that I haven't received a response to yet.
`;

export const ACTIONS = ["archive", "label", "reply", "to_do"] as const;

export const AI_MODEL = "gpt-3.5-turbo"; // rate limits worse for gpt-4
