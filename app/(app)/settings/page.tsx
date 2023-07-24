import { FormWrapper } from "@/components/Form";
import { AboutSection } from "@/app/(app)/settings/AboutSection";
import { LabelsSection } from "@/app/(app)/settings/LabelsSection";
import { DeleteSection } from "@/app/(app)/settings/DeleteSection";
import { SettingsSection } from "@/app/(app)/settings/SettingsSection";

export default function Settings() {
  return (
    <FormWrapper>
      <AboutSection />
      <LabelsSection />
      <SettingsSection />
      <DeleteSection />
    </FormWrapper>
  );
}
