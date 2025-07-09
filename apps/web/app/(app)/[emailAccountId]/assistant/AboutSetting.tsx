import { Button } from "@/components/ui/button";
import { SettingCard } from "@/components/SettingCard";

export function AboutSetting() {
  return (
    <SettingCard
      title="About you"
      description="Provide extra information that will help our AI better understand how to process your emails."
      right={
        <Button variant="outline" size="sm">
          Configure
        </Button>
      }
    />
  );
}
