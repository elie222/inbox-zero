import type { ThreadMessage } from "@/components/email-list/types";

export function EmailDetails({ message }: { message: ThreadMessage }) {
  const details = [
    { label: "From", value: message.headers.from },
    { label: "To", value: message.headers.to },
    { label: "CC", value: message.headers.cc },
    { label: "BCC", value: message.headers.bcc },
    {
      label: "Date",
      value: new Date(message.headers.date).toLocaleString(),
    },
    // { label: "Subject", value: message.headers.subject },
  ];

  return (
    <div className="bg-muted mb-4 rounded-md p-3 text-sm">
      <div className="grid gap-1">
        {details.map(
          ({ label, value }) =>
            value && (
              <div key={label} className="grid grid-cols-[auto_1fr] gap-2">
                <span className="text-foreground font-medium">{label}:</span>
                <span className="text-muted-foreground">{value}</span>
              </div>
            ),
        )}
      </div>
    </div>
  );
}
