// import { Assistant } from "@/app/assistant";
import { Chat } from "@/components/assistant-chat/chat";
import { DataStreamHandler } from "@/components/assistant-chat/data-stream-handler";

export default function AssistantChatPage() {
  // return <Assistant />;
  return (
    <>
      <Chat id="1" initialMessages={[]} selectedChatModel="gpt-4o" />
      <DataStreamHandler id="1" />
    </>
  );
}
