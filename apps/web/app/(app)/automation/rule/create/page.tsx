import { UpdateRuleForm } from "@/app/(app)/automation/UpdateRuleForm";

export default function CreateRulePage() {
  return (
    <div className="content-container mx-auto w-full max-w-3xl">
      <UpdateRuleForm
        rule={{
          name: "",
          actions: [],
          type: "AI",
        }}
        continueHref="/automation?tab=automations"
      />
    </div>
  );
}
