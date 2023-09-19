import { FormWrapper } from "@/components/Form";
import { AboutSection } from "@/app/(app)/settings/AboutSection";
import { LabelsSection } from "@/app/(app)/settings/LabelsSection";
import { DeleteSection } from "@/app/(app)/settings/DeleteSection";
import { RulesSection } from "@/app/(app)/settings/RulesSection";
import { ModelSection } from "@/app/(app)/settings/ModelSection";

export default function Settings() {
  return (
    <FormWrapper>
      <AboutSection />
      <RulesSection />
      <LabelsSection />
      <ModelSection />
      <DeleteSection />
    </FormWrapper>
  );
}
