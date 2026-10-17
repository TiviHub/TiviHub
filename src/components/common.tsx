import {
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

type HorizontalDragTrackProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "className" | "onClickCapture" | "onPointerCancel" | "onPointerDown" | "onPointerMove" | "onPointerUp"
> & {
  className: string;
  children: ReactNode;
};

export function HorizontalDragTrack({
  className,
  children,
  ...attributes
}: HorizontalDragTrackProps) {
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);

  function finishDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const activeDrag = drag.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (activeDrag.moved) {
      window.setTimeout(() => { suppressClick.current = false; }, 0);
    }
  }

  return (
    <div
      {...attributes}
      className={`${className}${dragging ? " is-dragging" : ""}`}
      onClickCapture={(event) => {
        if (!suppressClick.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClick.current = false;
      }}
      onPointerCancel={finishDrag}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse" || event.button !== 0) return;
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startScrollLeft: event.currentTarget.scrollLeft,
          moved: false,
        };
      }}
      onPointerMove={(event) => {
        const activeDrag = drag.current;
        if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
        const offset = event.clientX - activeDrag.startX;
        if (!activeDrag.moved && Math.abs(offset) > 5) {
          activeDrag.moved = true;
          suppressClick.current = true;
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        if (activeDrag.moved) {
          event.preventDefault();
          event.currentTarget.scrollLeft = activeDrag.startScrollLeft - offset;
        }
      }}
      onPointerUp={finishDrag}
    >
      {children}
    </div>
  );
}

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
  | "cast"
  | "cast_connected"
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
  | "sort"
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
  | "horizontal_rule"
  | "crop_square"
  | "filter_none"
  | "restore"
  | "backup"
  | "check_circle"
  | "error_outline"
  | "info"
  | "content_copy"
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
