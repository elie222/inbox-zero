import { useLingui } from "@lingui/react/macro";
import { Tooltip } from "@/components/Tooltip";
import { EmailDate } from "@/components/email-list/EmailDate";

export function DateCell({ createdAt }: { createdAt: Date }) {
  const { i18n } = useLingui();

  return (
    <div className="whitespace-nowrap">
      <Tooltip content={new Date(createdAt).toLocaleString(i18n.locale)}>
        <EmailDate date={new Date(createdAt)} />
      </Tooltip>
    </div>
  );
}
