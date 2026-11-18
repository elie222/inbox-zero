import { IllustrationWindow } from "@/app/(app)/[emailAccountId]/onboarding/illustrations/IllustrationWindow";

// Kept still on purpose: this step is an optional extra, so it shouldn't
// pull attention the way the animated feature steps do.
const rows = [
  { sender: "w-16", subject: "w-40", unread: true },
  { sender: "w-20", subject: "w-32", unread: true },
  { sender: "w-14", subject: "w-44", unread: false },
  { sender: "w-24", subject: "w-28", unread: false },
  { sender: "w-16", subject: "w-36", unread: false },
];

export function EmailAppIllustration() {
  return (
    <div aria-hidden className="relative h-[220px] w-[340px] max-w-full">
      <IllustrationWindow className="absolute top-0 left-0 w-[300px] shadow-xl">
        <div className="flex h-[170px]">
          <div className="w-16 shrink-0 space-y-2 border-r border-border bg-sidebar p-2.5">
            <div className="h-2 w-full rounded-full bg-blue-500/60" />
            <div className="h-2 w-3/4 rounded-full bg-muted-foreground/20" />
            <div className="h-2 w-2/3 rounded-full bg-muted-foreground/20" />
          </div>
          <div className="flex-1">
            {rows.map((row) => (
              <MailRow key={`${row.sender}-${row.subject}`} {...row} />
            ))}
          </div>
        </div>
      </IllustrationWindow>

      <div className="absolute right-0 bottom-0 h-[180px] w-[92px] overflow-hidden rounded-[20px] border-4 border-foreground/80 bg-background shadow-xl">
        <div className="mx-auto mt-1.5 mb-2 h-1.5 w-8 rounded-full bg-foreground/80" />
        {rows.slice(0, 4).map((row) => (
          <div
            key={`${row.sender}-${row.subject}`}
            className="space-y-1 border-b border-border px-2 py-2"
          >
            <div
              className={`h-1.5 w-10 rounded-full ${row.unread ? "bg-foreground/60" : "bg-muted-foreground/30"}`}
            />
            <div className="h-1.5 w-full rounded-full bg-muted-foreground/20" />
          </div>
        ))}
      </div>
    </div>
  );
}

function MailRow({
  sender,
  subject,
  unread,
}: {
  sender: string;
  subject: string;
  unread: boolean;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
      <span
        className={`size-1.5 shrink-0 rounded-full ${unread ? "bg-blue-500" : "bg-transparent"}`}
      />
      <div
        className={`h-2 shrink-0 rounded-full ${sender} ${unread ? "bg-foreground/60" : "bg-muted-foreground/30"}`}
      />
      <div className={`h-2 rounded-full bg-muted-foreground/20 ${subject}`} />
    </div>
  );
}
