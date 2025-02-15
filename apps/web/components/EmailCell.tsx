import { memo } from "react";

export const EmailCell = memo(function EmailCell({
  emailAddress,
  className,
}: {
  emailAddress: string;
  className?: string;
}) {
  const parseEmail = (name: string) => {
    const match = name.match(/<(.+)>/);
    return match ? match[1] : name;
  };
  const name = emailAddress.split("<")[0].trim();
  const email = parseEmail(emailAddress);

  return (
    <div className={className}>
      <div>{name}</div>
      <div className="text-muted-foreground">{email}</div>
    </div>
  );
});
