import { useEffect, useMemo, useState } from "react";
import {
  addChannel, audibleKeyAfter, channelKey, MAX_MULTIVIEW_TILES, multiViewColumns, multiViewSupport, removeChannel,
} from "../lib/multiView";
import { t } from "../lib/i18n";
import type { LiveChannel, Playlist } from "../types";
import { Icon, SearchField } from "./common";
import { EmptyPanel } from "./EmptyPanel";
import { MultiViewTile } from "./MultiViewTile";

const PICKER_LIMIT = 60;

/** Up to four live channels side by side; one has sound. Channels to pick from are the ones Live TV was showing. */
export function MultiViewDialog({ source, channels, start, onClose }: {
  source: Playlist;
  channels: LiveChannel[];
  start?: LiveChannel;
  onClose: () => void;
}) {
  const [tiles, setTiles] = useState<LiveChannel[]>(() => (start && multiViewSupport(start, source) === "ok" ? [start] : []));
  const [audible, setAudible] = useState<string | null>(() => (start ? channelKey(start) : null));
  const [picking, setPicking] = useState(() => !start);
  const [query, setQuery] = useState("");
  const [refused, setRefused] = useState<"drm" | "portal" | null>(null);
  const audibleKey = audibleKeyAfter(tiles, audible);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return channels.filter((channel) => !needle || channel.name.toLocaleLowerCase().includes(needle)).slice(0, PICKER_LIMIT);
  }, [channels, query]);

  function pick(channel: LiveChannel) {
    const support = multiViewSupport(channel, source);
    if (support !== "ok") {
      setRefused(support);
      return;
    }
    setRefused(null);
    const next = addChannel(tiles, channel);
    setTiles(next);
    if (next.length >= MAX_MULTIVIEW_TILES) setPicking(false);
  }

  return (
    <div className="modal-backdrop playback-backdrop" role="presentation">
      <section aria-labelledby="multiview-title" aria-modal="true" className="playback-dialog multiview-dialog" role="dialog">
        <header className="playback-header">
          <div>
            <h2 id="multiview-title">{t("multi.title")}</h2>
            <p className="playback-status">{t("multi.note", { count: MAX_MULTIVIEW_TILES })}</p>
          </div>
          <div className="playback-header-actions">
            {tiles.length < MAX_MULTIVIEW_TILES && (
              <button className="secondary-button" onClick={() => setPicking((open) => !open)} type="button">
                <Icon name="add" /> {t("multi.add")}
              </button>
            )}
            <button aria-label={t("multi.close")} className="icon-button" onClick={onClose} type="button">
              <Icon name="close" />
            </button>
          </div>
        </header>

        {picking && (
          <section aria-label={t("multi.add")} className="multiview-picker">
            <SearchField label={t("multi.search")} onChange={setQuery} placeholder={t("multi.search")} value={query} />
            {refused && <p className="form-error" role="alert">{t(refused === "drm" ? "multi.drm" : "multi.portal")}</p>}
            {matches.length === 0 ? (
              <EmptyPanel compact icon="search" title={t("categories.noMatchesTitle")}>{t("multi.noMatches")}</EmptyPanel>
            ) : (
              <div className="multiview-picker-list">
                {matches.map((channel) => (
                  <button
                    className="secondary-button"
                    disabled={tiles.some((tile) => channelKey(tile) === channelKey(channel))}
                    key={channelKey(channel)}
                    onClick={() => pick(channel)}
                    type="button"
                  >
                    {channel.name}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {tiles.length === 0 ? (
          <EmptyPanel icon="grid_view" title={t("multi.emptyTitle")}>{t("multi.emptyBody")}</EmptyPanel>
        ) : (
          <div className="multiview-grid" data-columns={multiViewColumns(tiles.length)}>
            {tiles.map((channel) => (
              <MultiViewTile
                audible={channelKey(channel) === audibleKey}
                channel={channel}
                key={channelKey(channel)}
                onRemove={() => setTiles((current) => removeChannel(current, channelKey(channel)))}
                onSelectAudio={() => setAudible(channelKey(channel))}
                userAgent={source.userAgent}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
