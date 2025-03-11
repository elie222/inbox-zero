import { ElevenLabsConvai } from "@/components/ElevenLabsConvai";
import { SectionDescription } from "@/components/Typography";
import { env } from "@/env";

export default function AssistantPage() {
  const agentId = env.NEXT_PUBLIC_ELEVENLABS_CLEANER_AGENT_ID;

  if (!agentId) {
    return (
      <div className="mt-20">
        <SectionDescription>Agent not set up</SectionDescription>
      </div>
    );
  }

  return (
    <div className="mt-20">
      <ElevenLabsConvai agentId={agentId} />
    </div>
  );
}
