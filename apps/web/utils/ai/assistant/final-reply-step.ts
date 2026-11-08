import { experimental_createSteering } from "ai";

const FINAL_REPLY_REQUEST =
  "Hidden app note: reply to the user now with a brief summary of what you did. No tools.";

// A tool loop can end on a step with reasoning but no text, leaving the user
// with no reply. Steering continues the run for one more step, without tools,
// so the model writes one.
export function createFinalReplyStep() {
  const steering = experimental_createSteering();
  let requested = false;

  return {
    steering,
    onStepEnd(step: { text: string; toolCalls: unknown[] }) {
      if (requested || step.toolCalls.length > 0 || step.text.trim()) return;
      requested = true;
      // Resolves with the delivery outcome and never rejects.
      steering.steer(FINAL_REPLY_REQUEST);
    },
    isFinalReplyStep(steeringMessages: unknown[] | undefined) {
      return !!steeringMessages?.length;
    },
  };
}
