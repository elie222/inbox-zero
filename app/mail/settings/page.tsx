import { FormWrapper } from "@/components/Form";
import { AboutSection } from "@/app/mail/settings/AboutSection";
import { LabelsSection } from "@/app/mail/settings/LabelsSectionForm";
import { DeleteSection } from "@/app/mail/settings/DeleteSection";

export default function Settings() {
  return (
    <FormWrapper>
      <AboutSection />
      <LabelsSection />
      <DeleteSection />
    </FormWrapper>
  );
}
