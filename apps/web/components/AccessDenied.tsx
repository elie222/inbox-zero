import { ShieldX } from "lucide-react";
import { TypographyH3, TypographyP } from "@/components/Typography";

export function AccessDenied({
  title = "Access Denied",
  message = "You don't have permission to access this page.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <ShieldX className="mb-4 h-12 w-12 text-muted-foreground" />
      <TypographyH3 className="mb-2">{title}</TypographyH3>
      <TypographyP>{message}</TypographyP>
    </div>
  );
}
