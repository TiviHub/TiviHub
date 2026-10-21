import { Icon } from "./common";
import { HomeEmptyState } from "./HomeEmptyState";

export function NoSourceEmptyState({ onAddSource }: { onAddSource: () => void }) {
  return (
    <HomeEmptyState
      actionIcon="add"
      actionLabel="Add source"
      description="Connect an M3U playlist or Xtream Codes account to build your library. Your source details are stored on this device; playback requests go directly to your provider."
      eyebrow="YOUR PRIVATE MEDIA SPACE"
      onAction={onAddSource}
      title="Add your first source"
    >
      <div aria-label="Supported source types" className="home-empty-source-types">
        <span><Icon name="playlist_play" /> M3U playlist</span>
        <span><Icon name="dns" /> Xtream Codes</span>
      </div>
    </HomeEmptyState>
  );
}
