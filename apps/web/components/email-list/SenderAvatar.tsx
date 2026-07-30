import { cn } from "@/utils";
import { nameHue } from "@/utils/name-color";

// A tinted initial for a correspondent, hue-hashed from their name so lists
// read colour-coded per person. The threads API carries no company data, so
// this stands in for the mockup's per-company chips.
export function SenderAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const initials =
    name
      .split(/\s+/)
      .map((word) => word[0])
      .filter(Boolean)
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  return (
    <span
      style={{ "--company-hue": nameHue(name) } as React.CSSProperties}
      className={cn(
        "company-chip flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
        className,
      )}
    >
      {initials}
    </span>
  );
}
