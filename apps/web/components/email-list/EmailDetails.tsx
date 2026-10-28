import type { ThreadMessage } from "@/components/email-list/types";
import {
  extractEmailAddress,
  extractNameFromEmail,
  splitRecipientList,
} from "@/utils/email";

// Spans rather than divs so the details can sit inside the header's toggle
// button.
export function EmailDetails({
  message,
  children,
}: {
  message: ThreadMessage;
  /** Shown after the date, such as the control that hides these details. */
  children?: React.ReactNode;
}) {
  const headers = message.headers;

  const details = [
    { label: "From", value: headers?.from },
    { label: "To", value: headers?.to },
    { label: "Cc", value: headers?.cc },
    { label: "Bcc", value: headers?.bcc },
  ];

  return (
    <span className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-left text-sm leading-6">
      {details.map(
        ({ label, value }) =>
          value && (
            <span key={label} className="contents">
              <span className="text-muted-foreground">{label}</span>
              <span className="break-words">
                {splitRecipientList(value).map((recipient, index) => (
                  <span key={`${index}-${recipient}`}>
                    {index > 0 && ", "}
                    <Recipient recipient={recipient} />
                  </span>
                ))}
              </span>
            </span>
          ),
      )}
      <span className="col-span-full flex items-center gap-2 text-muted-foreground">
        {new Date(headers?.date ?? message.date).toLocaleString(undefined, {
          dateStyle: "full",
          timeStyle: "short",
        })}
        {children}
      </span>
    </span>
  );
}

function Recipient({ recipient }: { recipient: string }) {
  const email = extractEmailAddress(recipient);
  const name = extractNameFromEmail(recipient);

  if (!email || !name || name === email) {
    return (
      <span className="font-medium text-foreground">{email || recipient}</span>
    );
  }

  return (
    <>
      <span className="font-medium text-foreground">{name}</span>{" "}
      <span className="text-muted-foreground">&lt;{email}&gt;</span>
    </>
  );
}
