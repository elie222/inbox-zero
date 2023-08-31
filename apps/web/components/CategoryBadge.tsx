import { Badge } from "@/components/Badge";
import { capitalCase } from "capital-case";

export function CategoryBadge(props: { category?: string }) {
  const { category } = props;

  return (
    <Badge
      color={category ? "blue" : "gray"}
      className="max-w-[100px] overflow-hidden"
    >
      {capitalCase(category || "Uncategorized")}
    </Badge>
  );
}
