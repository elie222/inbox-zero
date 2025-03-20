import {
  ActionBarPrimitive,
  BranchPickerPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import type { FC } from "react";
import {
  ArrowDownIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  PencilIcon,
  RefreshCwIcon,
  SendHorizontalIcon,
} from "lucide-react";
import { cn } from "@/utils";

import { Button } from "@/components/ui/button";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";

export const Thread: FC = () => {
  return (
    <ThreadPrimitive.Root
      className="box-border flex h-full flex-col overflow-hidden bg-white dark:bg-slate-950"
      style={{
        ["--thread-max-width" as string]: "42rem",
      }}
    >
      <ThreadPrimitive.Viewport className="flex h-full flex-col items-center overflow-y-scroll scroll-smooth bg-inherit px-4 pt-8">
        <ThreadWelcome />

        <ThreadPrimitive.Messages
          components={{
            UserMessage: UserMessage,
            EditComposer: EditComposer,
            AssistantMessage: AssistantMessage,
          }}
        />

        <ThreadPrimitive.If empty={false}>
          <div className="min-h-8 flex-grow" />
        </ThreadPrimitive.If>

        <div className="sticky bottom-0 mt-3 flex w-full max-w-[var(--thread-max-width)] flex-col items-center justify-end rounded-t-lg bg-inherit pb-4">
          <ThreadScrollToBottom />
          <Composer />
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="absolute -top-8 rounded-full disabled:invisible"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  return (
    <ThreadPrimitive.Empty>
      <div className="flex w-full max-w-[var(--thread-max-width)] flex-grow flex-col">
        <div className="flex w-full flex-grow flex-col items-center justify-center">
          <p className="mt-4 font-medium">How can I help you today?</p>
        </div>
        <ThreadWelcomeSuggestions />
      </div>
    </ThreadPrimitive.Empty>
  );
};

const ThreadWelcomeSuggestions: FC = () => {
  return (
    <div className="mt-3 grid w-full gap-2 lg:grid-cols-2">
      <ThreadPrimitive.Suggestion
        className="flex max-w-sm grow basis-0 flex-col items-center justify-center rounded-lg border border-slate-200 p-3 transition-colors ease-in hover:bg-slate-100/80 dark:border-slate-800 dark:hover:bg-slate-800/80"
        prompt="What can you do?"
        method="replace"
        autoSend
      >
        <span className="line-clamp-2 text-ellipsis text-sm font-semibold">
          What can you do?
        </span>
      </ThreadPrimitive.Suggestion>
      <ThreadPrimitive.Suggestion
        className="flex max-w-sm grow basis-0 flex-col items-center justify-center rounded-lg border border-slate-200 p-3 transition-colors ease-in hover:bg-slate-100/80 dark:border-slate-800 dark:hover:bg-slate-800/80"
        prompt="Add a rule to label and archive newsletters I get as 'Newsletter'"
        method="replace"
        autoSend
      >
        <span className="line-clamp-2 text-ellipsis text-sm font-semibold">
          Label and archive newsletters
        </span>
      </ThreadPrimitive.Suggestion>
      <ThreadPrimitive.Suggestion
        className="flex max-w-sm grow basis-0 flex-col items-center justify-center rounded-lg border border-slate-200 p-3 transition-colors ease-in hover:bg-slate-100/80 dark:border-slate-800 dark:hover:bg-slate-800/80"
        prompt="Add a rule to label urgent emails as 'Urgent'"
        method="replace"
        autoSend
      >
        <span className="line-clamp-2 text-ellipsis text-sm font-semibold">
          Label urgent emails
        </span>
      </ThreadPrimitive.Suggestion>
      <ThreadPrimitive.Suggestion
        className="flex max-w-sm grow basis-0 flex-col items-center justify-center rounded-lg border border-slate-200 p-3 transition-colors ease-in hover:bg-slate-100/80 dark:border-slate-800 dark:hover:bg-slate-800/80"
        prompt="Add a rule to label emails needing a reply as 'Needs Reply'"
        method="replace"
        autoSend
      >
        <span className="line-clamp-2 text-ellipsis text-sm font-semibold">
          Label emails needing a reply
        </span>
      </ThreadPrimitive.Suggestion>
    </div>
  );
};

const Composer: FC = () => {
  return (
    <ComposerPrimitive.Root className="flex w-full flex-wrap items-end rounded-lg border border-slate-200 bg-inherit px-2.5 shadow-sm transition-colors ease-in focus-within:border-slate-950/20 dark:border-slate-800 dark:focus-within:border-slate-300/20">
      <ComposerPrimitive.Input
        rows={1}
        autoFocus
        placeholder="Write a message..."
        className="max-h-40 flex-grow resize-none border-none bg-transparent px-2 py-4 text-sm outline-none placeholder:text-slate-500 focus:ring-0 disabled:cursor-not-allowed dark:placeholder:text-slate-400"
      />
      <ComposerAction />
    </ComposerPrimitive.Root>
  );
};

const ComposerAction: FC = () => {
  return (
    <>
      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send asChild>
          <TooltipIconButton
            tooltip="Send"
            variant="default"
            className="my-2.5 size-8 p-2 transition-opacity ease-in"
          >
            <SendHorizontalIcon />
          </TooltipIconButton>
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>
      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel asChild>
          <TooltipIconButton
            tooltip="Cancel"
            variant="default"
            className="my-2.5 size-8 p-2 transition-opacity ease-in"
          >
            <CircleStopIcon />
          </TooltipIconButton>
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
    </>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="grid w-full max-w-[var(--thread-max-width)] auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] gap-y-2 py-4 [&:where(>*)]:col-start-2">
      <UserActionBar />

      <div className="col-start-2 row-start-2 max-w-[calc(var(--thread-max-width)*0.8)] break-words rounded-3xl bg-slate-100 px-5 py-2.5 text-slate-950 dark:bg-slate-800 dark:text-slate-50">
        <MessagePrimitive.Content />
      </div>

      <BranchPicker className="col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="col-start-1 row-start-2 mr-3 mt-2.5 flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <ComposerPrimitive.Root className="my-4 flex w-full max-w-[var(--thread-max-width)] flex-col gap-2 rounded-xl bg-slate-100 dark:bg-slate-800">
      <ComposerPrimitive.Input className="flex h-8 w-full resize-none bg-transparent p-4 pb-0 text-slate-950 outline-none dark:text-slate-50" />

      <div className="mx-3 mb-3 flex items-center justify-center gap-2 self-end">
        <ComposerPrimitive.Cancel asChild>
          <Button variant="ghost">Cancel</Button>
        </ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send asChild>
          <Button>Send</Button>
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  );
};

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="relative grid w-full max-w-[var(--thread-max-width)] grid-cols-[auto_auto_1fr] grid-rows-[auto_1fr] py-4">
      <div className="col-span-2 col-start-2 row-start-1 my-1.5 max-w-[calc(var(--thread-max-width)*0.8)] break-words leading-7 text-slate-950 dark:text-slate-50">
        <MessagePrimitive.Content components={{ Text: MarkdownText }} />
      </div>

      <AssistantActionBar />

      <BranchPicker className="col-start-2 row-start-2 -ml-2 mr-2" />
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      autohideFloat="single-branch"
      className="col-start-3 row-start-2 -ml-1 flex gap-1 text-slate-500 data-[floating]:absolute data-[floating]:rounded-md data-[floating]:border data-[floating]:bg-white data-[floating]:p-1 data-[floating]:shadow-sm dark:text-slate-400 dark:data-[floating]:bg-slate-950"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy">
          <MessagePrimitive.If copied>
            <CheckIcon />
          </MessagePrimitive.If>
          <MessagePrimitive.If copied={false}>
            <CopyIcon />
          </MessagePrimitive.If>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="Refresh">
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "inline-flex items-center text-xs text-slate-500 dark:text-slate-400",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};

const CircleStopIcon = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 16"
      fill="currentColor"
      width="16"
      height="16"
      aria-labelledby="stopIconTitle"
    >
      <title id="stopIconTitle">Stop</title>
      <rect width="10" height="10" x="3" y="3" rx="2" />
    </svg>
  );
};
