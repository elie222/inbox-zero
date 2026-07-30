import { Fragment } from "react";
import type { ThreadMessage } from "@/components/email-list/types";
import { useContactPeek } from "@/components/email-list/contact-peek-context";
import { extractEmailAddress, splitRecipientList } from "@/utils/email";

export function EmailDetails({ message }: { message: ThreadMessage }) {
  const headers = message.headers;

  const details = [
    { label: "From", value: headers?.from, contacts: true },
    { label: "To", value: headers?.to, contacts: true },
    { label: "CC", value: headers?.cc, contacts: true },
    { label: "BCC", value: headers?.bcc, contacts: true },
    {
      label: "Date",
      value: new Date(headers?.date ?? message.date).toLocaleString(),
      contacts: false,
    },
  ];

  return (
    <div className="mb-4 rounded-md bg-muted p-3 text-sm">
      <div className="grid gap-1">
        {details.map(
          ({ label, value, contacts }) =>
            value && (
              <div key={label} className="grid grid-cols-[auto,1fr] gap-2">
                <span className="font-medium text-foreground">{label}:</span>
                <span className="min-w-0 break-words text-muted-foreground">
                  {contacts ? <RecipientList value={value} /> : value}
                </span>
              </div>
            ),
        )}
      </div>
    </div>
  );
}

// Every address opens (or starts) that person's contact card
function RecipientList({ value }: { value: string }) {
  const openContactPeek = useContactPeek();
  const recipients = splitRecipientList(value);

  if (!openContactPeek || !recipients.length) return <>{value}</>;

  return (
    <>
      {recipients.map((recipient, i) => (
        <Fragment key={recipient}>
          {i > 0 && ", "}
          <button
            type="button"
            className="text-left hover:underline"
            onClick={() =>
              openContactPeek(extractEmailAddress(recipient) || recipient)
            }
          >
            {recipient}
          </button>
        </Fragment>
      ))}
    </>
  );
}
