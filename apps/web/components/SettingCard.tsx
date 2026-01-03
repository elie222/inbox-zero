import { MutedText } from "@/components/Typography";
import { Card, CardContent } from "@/components/ui/card";

export function SettingCard({
  title,
  description,
  right,
  collapseOnMobile = false,
}: {
  title: string;
  description: string;
  right: React.ReactNode;
  collapseOnMobile?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div
          className={
            collapseOnMobile
              ? "flex flex-col gap-4 md:flex-row md:items-center"
              : "flex items-center gap-4"
          }
        >
          <div className="flex-1">
            <h3 className="font-medium">{title}</h3>
            <MutedText>{description}</MutedText>
          </div>

          {right}
        </div>
      </CardContent>
    </Card>
  );
}
