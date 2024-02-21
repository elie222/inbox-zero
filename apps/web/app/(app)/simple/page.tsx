import { Button } from "@/components/Button";
import { PageHeading } from "@/components/Typography";
import { BookmarkPlusIcon } from "lucide-react";

const emails = [
  {
    id: 1,
    from: "The Rundown AI",
    subject: "🎥 OpenAI changes the AI video world!",
    snippet:
      "Google came out hot with another new Gemini upgrade — but OpenAI countered with a stealth drop that just elevated AI video to a whole new level. Let’s get into it.",
  },
  {
    id: 2,
    from: "The Rundown AI",
    subject: "🎥 OpenAI changes the AI video world!",
    snippet:
      "Google came out hot with another new Gemini upgrade — but OpenAI countered with a stealth drop that just elevated AI video to a whole new level. Let’s get into it.",
  },
  {
    id: 3,
    from: "The Rundown AI",
    subject: "🎥 OpenAI changes the AI video world!",
    snippet:
      "Google came out hot with another new Gemini upgrade — but OpenAI countered with a stealth drop that just elevated AI video to a whole new level. Let’s get into it.",
  },
  {
    id: 4,
    from: "The Rundown AI",
    subject: "🎥 OpenAI changes the AI video world!",
    snippet:
      "Google came out hot with another new Gemini upgrade — but OpenAI countered with a stealth drop that just elevated AI video to a whole new level. Let’s get into it.",
  },
  {
    id: 5,
    from: "The Rundown AI",
    subject: "🎥 OpenAI changes the AI video world!",
    snippet:
      "Google came out hot with another new Gemini upgrade — but OpenAI countered with a stealth drop that just elevated AI video to a whole new level. Let’s get into it.",
  },
];

export default function SimplePage() {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <PageHeading className="text-center">Today{`'`}s newsletters</PageHeading>

      <div className="mt-8 grid gap-4">
        {emails.map((email) => (
          <div key={email.id} className="bg-white p-4 shadow sm:rounded-lg">
            <div className="flex items-center">
              <div className="font-bold">{email.from}</div>
              <div className="ml-4 mr-4">{email.subject}</div>
              <Button className="ml-auto" color="white" size="sm">
                <BookmarkPlusIcon className="mr-2 h-4 w-4" />
                Read Later
              </Button>
            </div>
            <div className="mt-2 text-sm text-gray-700">{email.snippet}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <Button size="2xl">Next</Button>
      </div>
    </div>
  );
}
