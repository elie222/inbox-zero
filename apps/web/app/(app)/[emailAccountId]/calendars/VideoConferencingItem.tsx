import { Trans, useLingui } from "@lingui/react/macro";
import { Toggle } from "@/components/Toggle";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";

export function VideoConferencingItem({
  canAddVideo,
  videoEnabled,
  videoLabel,
  onChange,
}: {
  canAddVideo: boolean;
  videoEnabled: boolean;
  videoLabel: string | null;
  onChange: (enabled: boolean) => void;
}) {
  const { t } = useLingui();

  return (
    <Item variant="outline">
      <ItemContent>
        <ItemTitle>
          <Trans>Video conferencing</Trans>
        </ItemTitle>
        <ItemDescription>
          {videoLabel
            ? t`Add ${videoLabel} to calendar events.`
            : t`Video links are unavailable for this calendar.`}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Toggle
          name="videoConferencing"
          ariaLabel={t`Toggle video conferencing`}
          enabled={canAddVideo && videoEnabled}
          disabled={!canAddVideo}
          onChange={onChange}
        />
      </ItemActions>
    </Item>
  );
}
