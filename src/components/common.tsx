import { useEffect, useRef } from "react";

export type IconName =
  | "home"
  | "live_tv"
  | "movie"
  | "tv"
  | "bookmark"
  | "settings"
  | "play_arrow"
  | "arrow_forward"
  | "devices"
  | "shield"
  | "light_mode"
  | "dark_mode"
  | "brightness_auto"
  | "check"
  | "download"
  | "close"
  | "playlist_play"
  | "dns"
  | "lock"
  | "link"
  | "add"
  | "refresh"
  | "favorite"
  | "favorite_border"
  | "search"
  | "filter_list"
  | "schedule"
  | "chevron_left"
  | "chevron_right"
  | "delete"
  | "edit"
  | "expand_more"
  | "arrow_back"
  | "subtitles"
  | "library_add"
  | "more_vert"
  | "restore"
  | "backup"
  | "check_circle"
  | "error_outline"
  | "info"
  | "logout";

export function Icon({ name }: { name: IconName }) {
  const iconRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const button = iconRef.current?.closest("button");
    if (!button || (button.title && button.dataset.iconTooltip !== "true")) return;
    const clone = button.cloneNode(true) as HTMLButtonElement;
    clone.querySelectorAll(".material-icons").forEach((icon) => icon.remove());
    const label = button.getAttribute("aria-label")?.trim() || clone.textContent?.trim() || "";
    if (label) {
      button.title = label;
      button.dataset.iconTooltip = "true";
    }
  }, [name]);

  return <span aria-hidden="true" className="material-icons" ref={iconRef}>{name}</span>;
}
