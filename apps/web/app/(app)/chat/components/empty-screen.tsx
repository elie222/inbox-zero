import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const exampleMessages = [
  {
    heading: "What important emails did I get today?",
    message: "What important emails did I get today?",
  },
  {
    heading: "Send Jennifer an email saying I'll be late",
    message: "Send Jennifer an email saying I'll be late",
  },
  {
    heading: "Forward the last email from my boss to my team",
    message: "Forward the last email from my boss to my team",
  },
];

export function EmptyScreen({
  submitMessage,
}: {
  submitMessage: (message: string) => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4">
      <div className="mb-4 rounded-lg border bg-background p-8">
        <h1 className="mb-2 text-lg font-semibold">
          Welcome to Inbox Zero Generative UI demo!
        </h1>
        <p className="mb-2 leading-normal text-muted-foreground">
          This is a demo of an interactive email assistant. It can help you
          manage your inbox by generating UIs to perform common email tasks.
        </p>
        <p className="leading-normal text-muted-foreground">Try an example:</p>
        <div className="mb-4 mt-4 flex flex-col items-start space-y-2">
          {exampleMessages.map((message, index) => (
            <Button
              key={index}
              variant="link"
              className="h-auto p-0 text-base"
              onClick={async () => {
                submitMessage(message.message);
              }}
            >
              <ArrowRightIcon className="mr-2 text-muted-foreground" />
              {message.heading}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
