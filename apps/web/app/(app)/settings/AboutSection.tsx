import { AboutSectionForm } from "@/app/(app)/settings/AboutSectionForm";

export const AboutSection = async ({ about }: { about: string | null }) => {
  return <AboutSectionForm about={about} />;
};
