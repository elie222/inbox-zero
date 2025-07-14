import { Card, CardContent } from "@/components/ui/card";

export function SettingCard({
  title,
  description,
  right,
}: {
  title: string;
  description: string;
  right: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <h3 className="font-medium">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>

          {right}
        </div>
      </CardContent>
    </Card>
  );
}
