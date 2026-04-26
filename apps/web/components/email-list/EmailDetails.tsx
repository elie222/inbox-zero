import type { ThreadMessage } from "@/components/email-list/types";

export function EmailDetails({ message }: { message: ThreadMessage }) {
  const headers = message.headers;

  const details = [
    { label: "From", value: headers?.from },
    { label: "To", value: headers?.to },
    { label: "CC", value: headers?.cc },
    { label: "BCC", value: headers?.bcc },
    {
      label: "Date",
      value: new Date(headers?.date ?? message.date).toLocaleString(),
    },
    // { label: "Subject", value: message.headers.subject },
  ];

  return (
    <div className="mb-4 rounded-md bg-muted p-3 text-sm">
      <div className="grid gap-1">
        {details.map(
          ({ label, value }) =>
            value && (
              <div key={label} className="grid grid-cols-[auto,1fr] gap-2">
                <span className="font-medium text-foreground">{label}:</span>
                <span className="text-muted-foreground">{value}</span>
              </div>
            ),
        )}
      </div>
    </div>
  );
}
