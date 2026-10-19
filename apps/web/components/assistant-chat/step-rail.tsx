"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CheckIcon, ChevronRightIcon, Loader2Icon, XIcon } from "lucide-react";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
  useReasoning,
} from "@/components/ai-elements/reasoning";
import {
  getFoldedSteps,
  type RailStep,
  type StepStatus,
} from "@/components/assistant-chat/step-model";
import { cn } from "@/utils/index";

const StepRailContext = createContext(false);

/** True under a rail node, where the node's own label replaces status lines. */
export function useInStepRail() {
  return useContext(StepRailContext);
}

export function StepRail({
  steps,
  renderDetail,
}: {
  steps: RailStep[];
  renderDetail?: (step: RailStep) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const folded = useMemo(() => getFoldedSteps(steps), [steps]);
  const firstFolded = steps.find((step) => folded.has(step));
  const shown = expanded ? steps : steps.filter((step) => !folded.has(step));

  return (
    <StepRailContext.Provider value>
      <ol
        aria-label="Assistant steps"
        aria-live="polite"
        aria-relevant="additions"
        // One size drives the knob, the rail line, the label line height and
        // the knob icon, so they cannot drift apart.
        className="m-0 flex list-none flex-col p-0 [--rail-gap:0.5rem] [--rail-knob:1.25rem]"
      >
        {firstFolded && (
          <FoldRow
            count={folded.size}
            expanded={expanded}
            onToggle={() => setExpanded((value) => !value)}
          />
        )}
        {shown.map((step, index) => (
          <StepRow
            key={step.key}
            step={step}
            isLast={index === shown.length - 1}
            detail={renderDetail?.(step)}
          />
        ))}
      </ol>
    </StepRailContext.Provider>
  );
}

function StepRow({
  step,
  isLast,
  detail,
}: {
  step: RailStep;
  isLast: boolean;
  detail?: ReactNode;
}) {
  return (
    <li
      data-status={step.status}
      className="relative flex gap-[var(--rail-gap)] pb-[var(--rail-gap)] last:pb-0 duration-150 ease-out animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none"
    >
      <KnobColumn isLast={isLast}>
        <StepKnob status={step.status} />
      </KnobColumn>
      <div className="min-w-0 flex-1">
        {step.kind === "reasoning" ? (
          <ReasoningBody step={step} />
        ) : (
          <StepLabel step={step} />
        )}
        {detail && (
          <div aria-live="off" className="mt-2 space-y-2">
            {detail}
          </div>
        )}
      </div>
    </li>
  );
}

function FoldRow({
  count,
  expanded,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="relative flex gap-[var(--rail-gap)] pb-[var(--rail-gap)]">
      <KnobColumn isLast={false}>
        <span
          aria-hidden
          className="size-1.5 self-center rounded-full bg-muted-foreground/50"
        />
      </KnobColumn>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex h-[var(--rail-knob)] items-center gap-1 rounded-sm text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        {count} earlier {count === 1 ? "step" : "steps"}
        <Chevron open={expanded} />
      </button>
    </li>
  );
}

function KnobColumn({
  isLast,
  children,
}: {
  isLast: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative flex w-[var(--rail-knob)] shrink-0 justify-center">
      {!isLast && (
        <span
          aria-hidden
          className="absolute top-[var(--rail-knob)] bottom-[calc(var(--rail-gap)*-1)] w-px bg-border"
        />
      )}
      {children}
    </div>
  );
}

function StepKnob({ status }: { status: StepStatus }) {
  const icon = "size-[calc(var(--rail-knob)*0.6)]";
  return (
    <span
      className={cn(
        "relative z-10 grid size-[var(--rail-knob)] shrink-0 place-items-center rounded-full transition-colors duration-150 motion-reduce:transition-none",
        status === "running" && "border-2 border-border bg-background",
        status === "done" && "bg-primary text-primary-foreground",
        status === "failed" &&
          "border-2 border-dashed border-red-600 bg-background text-red-600 dark:border-red-400 dark:text-red-400",
      )}
    >
      {/* Keyed so a state change cross-fades the glyph inside the same knob. */}
      <span
        key={status}
        className="grid place-items-center duration-150 animate-in fade-in-0 zoom-in-75 motion-reduce:animate-none"
      >
        {status === "running" && (
          <Loader2Icon
            aria-hidden
            className={cn(icon, "animate-spin motion-reduce:animate-none")}
          />
        )}
        {status === "done" && (
          <CheckIcon aria-hidden strokeWidth={3} className={icon} />
        )}
        {status === "failed" && (
          <XIcon aria-hidden strokeWidth={3} className={icon} />
        )}
      </span>
    </span>
  );
}

function StepLabel({ step }: { step: RailStep }) {
  const failed = step.status === "failed";
  return (
    <p
      className={cn(
        "m-0 break-words text-sm leading-[var(--rail-knob)]",
        failed && "text-red-600 dark:text-red-400",
        step.status === "running" && "text-foreground",
        step.status === "done" && "text-muted-foreground",
      )}
    >
      <span className="sr-only">{statusWord(step.status)}: </span>
      {step.label}
      {step.meta && (
        <span
          className={cn(
            "text-[13px]",
            failed ? "text-inherit" : "text-muted-foreground",
          )}
        >
          {" · "}
          {step.meta}
        </span>
      )}
    </p>
  );
}

function ReasoningBody({ step }: { step: RailStep }) {
  return (
    <Reasoning isStreaming={step.status === "running"} className="mb-0 w-full">
      <ReasoningTrigger className="h-[var(--rail-knob)] w-fit rounded-sm text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ReasoningLabel />
      </ReasoningTrigger>
      <ReasoningContent className="mt-2 text-[13px]">
        {step.text ?? ""}
      </ReasoningContent>
    </Reasoning>
  );
}

function ReasoningLabel() {
  const { isStreaming, isOpen, duration } = useReasoning();
  let label = "Thought";
  if (isStreaming) label = "Thinking…";
  else if (duration) label = `Thought for ${duration} s`;
  return (
    <>
      {label}
      <Chevron open={isOpen} />
    </>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronRightIcon
      aria-hidden
      className={cn(
        "size-3.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none",
        open && "rotate-90",
      )}
    />
  );
}

function statusWord(status: StepStatus) {
  if (status === "running") return "Running";
  if (status === "failed") return "Failed";
  return "Done";
}
