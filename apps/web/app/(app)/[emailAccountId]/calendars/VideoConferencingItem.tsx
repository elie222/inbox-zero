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
  return (
    <Item variant="outline">
      <ItemContent>
        <ItemTitle>Video conferencing</ItemTitle>
        <ItemDescription>
          {videoLabel
            ? `Add ${videoLabel} to calendar events.`
            : "Video links are unavailable for this calendar."}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Toggle
          name="videoConferencing"
          ariaLabel="Toggle video conferencing"
          enabled={canAddVideo && videoEnabled}
          disabled={!canAddVideo}
          onChange={onChange}
        />
      </ItemActions>
    </Item>
  );
}
