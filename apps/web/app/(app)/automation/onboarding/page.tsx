import { Card } from "@/components/ui/card";
import { CategoriesSetup } from "./CategoriesSetup";

export default function OnboardingPage() {
  return (
    <Card className="my-4 w-full max-w-2xl p-6 sm:mx-4 md:mx-auto">
      <CategoriesSetup />
    </Card>
  );
}
