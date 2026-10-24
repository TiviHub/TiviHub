import { t } from "../lib/i18n";
import { Icon } from "./common";
import { HomeEmptyState } from "./HomeEmptyState";

export function NoSourceEmptyState({ onAddSource }: { onAddSource: () => void }) {
  return (
    <HomeEmptyState
      actionIcon="add"
      actionLabel={t("noSource.action")}
      description={t("noSource.description")}
      eyebrow={t("noSource.eyebrow")}
      onAction={onAddSource}
      title={t("noSource.title")}
    >
      <div aria-label={t("noSource.typesLabel")} className="home-empty-source-types">
        <span><Icon name="playlist_play" /> {t("noSource.m3u")}</span>
        <span><Icon name="dns" /> Xtream Codes</span>
      </div>
    </HomeEmptyState>
  );
}
