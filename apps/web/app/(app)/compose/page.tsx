import { ComposeEmailFormLazy } from "@/app/(app)/compose/ComposeEmailFormLazy";
import { TopSection } from "@/components/TopSection";

export default function ComposePage() {
  return (
    <>
      <TopSection title="New Message" />

      <div className="content-container max-w-2xl py-6">
        <ComposeEmailFormLazy />
      </div>
    </>
  );
}
