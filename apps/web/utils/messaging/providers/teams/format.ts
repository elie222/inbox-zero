import { Card, CardText } from "chat";

export function buildTeamsTextCard(text: string) {
  // The adapter's plain-text and Markdown paths interpret email addresses as mentions.
  return Card({
    children: text
      .split("\n")
      .filter(Boolean)
      .map((line) => CardText(line)),
  });
}
