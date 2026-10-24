import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./common";

export interface PlayerMenuSection {
  title: string;
  options: { label: string; value: string; active: boolean }[];
  onSelect: (value: string) => void;
}

export interface PlayerMenuAction {
  label: string;
  icon: IconName;
  onClick: () => void;
}

/** One settings button on the player bar: subtitles, audio and quality choices, plus subtitle actions, in a menu above it. */
export function PlayerMenu({ sections, actions }: { sections: PlayerMenuSection[]; actions: PlayerMenuAction[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  if (sections.length === 0 && actions.length === 0) return null;
  return (
    <div className="player-menu" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Subtitles, audio and quality"
        className={`icon-button${open ? " selected" : ""}`}
        data-tooltip={open ? undefined : "Subtitles, audio and quality"}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Icon name="subtitles" />
      </button>
      {open && (
        <div className="custom-select-menu player-menu-panel" role="menu">
          {sections.map((section) => (
            <div aria-label={section.title} className="player-menu-section" key={section.title} role="group">
              <p className="player-menu-title">{section.title}</p>
              {section.options.map((option) => (
                <button
                  aria-checked={option.active}
                  className="custom-select-option"
                  key={option.value}
                  onClick={() => { section.onSelect(option.value); setOpen(false); }}
                  role="menuitemradio"
                  type="button"
                >
                  <span>{option.label}</span>
                  {option.active && <Icon name="check" />}
                </button>
              ))}
            </div>
          ))}
          {actions.length > 0 && (
            <div className="player-menu-section" role="group">
              {actions.map((action) => (
                <button
                  className="custom-select-option"
                  key={action.label}
                  onClick={() => { action.onClick(); setOpen(false); }}
                  role="menuitem"
                  type="button"
                >
                  <Icon name={action.icon} />
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
