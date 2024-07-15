import { Badge, type Color } from "@/components/Badge";
import { capitalCase } from "capital-case";

const categoryColors: Record<string, Color> = {
  NEWSLETTER: "blue",
  PROMOTIONAL: "yellow",
  RECEIPT: "yellow",
  ALERT: "yellow",
  NOTIFICATION: "yellow",
  FORUM: "yellow",
  EVENT: "green",
  TRAVEL: "green",
  QUESTION: "red",
  SUPPORT: "red",
  COLD_EMAIL: "yellow",
  SOCIAL_MEDIA: "yellow",
  LEGAL_UPDATE: "yellow",
  OTHER: "yellow",
};

export function CategoryBadge(props: { category?: string }) {
  const { category } = props;

  return (
    <Badge
      color={category ? categoryColors[category] || "gray" : "gray"}
      className="max-w-[100px] overflow-hidden"
    >
      {capitalCase(category || "Uncategorized")}
    </Badge>
  );
}
