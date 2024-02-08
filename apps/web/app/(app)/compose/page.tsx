import { ComposeEmailForm } from "@/app/(app)/compose/ComposeEmailForm";
import { TopSection } from "@/components/TopSection";

export default function ComposePage() {
  return (
    <>
      <TopSection title="New Message" />

      <div className="max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
        <ComposeEmailForm />
      </div>
    </>
  );
}
