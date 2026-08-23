import type { EmailLabelColor } from "@/utils/email/types";

export const GMAIL_LABEL_COLORS = [
  gmailColor("Light red", "#f6c5be", "#000000"),
  gmailColor("Light orange", "#ffe6c7", "#000000"),
  gmailColor("Light yellow", "#fef1d1", "#000000"),
  gmailColor("Light green", "#b9e4d0", "#000000"),
  gmailColor("Light teal", "#c6f3de", "#000000"),
  gmailColor("Light blue", "#c9daf8", "#000000"),
  gmailColor("Light purple", "#e4d7f5", "#000000"),
  gmailColor("Light pink", "#fcdee8", "#000000"),
  gmailColor("Red", "#e66550", "#000000"),
  gmailColor("Orange", "#ffbc6b", "#000000"),
  gmailColor("Yellow", "#fcda83", "#000000"),
  gmailColor("Green", "#44b984", "#000000"),
  gmailColor("Teal", "#68dfa9", "#000000"),
  gmailColor("Blue", "#6d9eeb", "#000000"),
  gmailColor("Purple", "#b694e8", "#000000"),
  gmailColor("Pink", "#f7a7c0", "#000000"),
  gmailColor("Dark red", "#822111", "#ffffff"),
  gmailColor("Dark orange", "#a46a21", "#ffffff"),
  gmailColor("Dark yellow", "#aa8831", "#ffffff"),
  gmailColor("Dark green", "#076239", "#ffffff"),
  gmailColor("Dark teal", "#1a764d", "#ffffff"),
  gmailColor("Dark blue", "#1c4587", "#ffffff"),
  gmailColor("Dark purple", "#41236d", "#ffffff"),
  gmailColor("Dark pink", "#83334c", "#ffffff"),
] as const;

export function isGmailLabelColor(color: EmailLabelColor): boolean {
  return GMAIL_LABEL_COLORS.some(
    (option) =>
      option.backgroundColor.toLowerCase() ===
        color.backgroundColor.toLowerCase() &&
      option.textColor.toLowerCase() === color.textColor.toLowerCase(),
  );
}

function gmailColor(name: string, backgroundColor: string, textColor: string) {
  return { name, backgroundColor, textColor };
}
