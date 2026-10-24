import { useEffect, useRef, useState } from "react";
import { formatDateTime, t } from "../lib/i18n";
import type { Reminder } from "../types";
import { EmptyPanel } from "./EmptyPanel";
import { Icon } from "./common";

/** The topbar bell: reminders that are set and the ones that just went off, with a dot while something new is unseen. */
export function RemindersMenu({ reminders, recent, unseen, onClearRecent, onMarkSeen, onRemove, canOpen, onOpen, defaultOpen = false }: {
  /** Whether the reminder's channel can be opened (it belongs to the active source). */
  canOpen: (reminder: Reminder) => boolean;
  onOpen: (reminder: Reminder) => void;
  /** Only the style guide opens it from the start. */
  defaultOpen?: boolean;
  reminders: readonly Reminder[];
  recent: readonly Reminder[];
  unseen: number;
  onClearRecent: () => void;
  onMarkSeen: () => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef<HTMLDivElement>(null);
  const upcoming = [...reminders].sort((a, b) => a.startMillis - b.startMillis);

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

  // Opening the list is what "seen" means, also for a reminder that fires while it is open.
  useEffect(() => {
    if (open && unseen > 0) onMarkSeen();
  }, [open, unseen, onMarkSeen]);

  function Text({ reminder, note }: { reminder: Reminder; note?: string }) {
    const body = <span><strong>{reminder.title}</strong><small>{reminder.channelName} · {formatDateTime(reminder.startMillis)}{note}</small></span>;
    if (!canOpen(reminder)) return body;
    return (
      <button
        aria-label={t("reminders.openAria", { title: reminder.title, channel: reminder.channelName })}
        className="reminders-open"
        onClick={() => { setOpen(false); onOpen(reminder); }}
        type="button"
      >
        {body}
        <Icon name="live_tv" />
      </button>
    );
  }

  const label = unseen > 0 ? t("reminders.menuNew") : t("reminders.menu");
  return (
    <div className="reminders-menu" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        className={`icon-button topbar-action-button${open ? " selected" : ""}`}
        data-tooltip={open ? undefined : label}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Icon name={reminders.length > 0 ? "notifications_active" : "notifications"} />
        {unseen > 0 && <span aria-hidden="true" className="reminders-dot" />}
      </button>
      {open && (
        <div aria-label={t("reminders.menu")} className="custom-select-menu reminders-panel" role="dialog">
          {upcoming.length === 0 && recent.length === 0 && (
            <EmptyPanel compact icon="notifications" title={t("reminders.emptyTitle")}>{t("reminders.emptyBody")}</EmptyPanel>
          )}
          {upcoming.length > 0 && (
            <section aria-label={t("reminders.scheduled")}>
              <p className="player-menu-title">{t("reminders.scheduled")}</p>
              {upcoming.map((reminder) => (
                <div className="reminders-row" key={reminder.id}>
                  <Text reminder={reminder} />
                  <button
                    aria-label={t("reminders.removeAria", { title: reminder.title })}
                    className="icon-button"
                    data-tooltip={t("reminders.remove")}
                    onClick={() => onRemove(reminder.id)}
                    type="button"
                  >
                    <Icon name="close" />
                  </button>
                </div>
              ))}
            </section>
          )}
          {recent.length > 0 && (
            <section aria-label={t("reminders.recent")}>
              <p className="player-menu-title">{t("reminders.recent")}</p>
              {recent.map((reminder) => (
                <div className="reminders-row" key={`${reminder.id}`}>
                  <Text note={reminder.missed ? ` · ${t("reminders.missed")}` : undefined} reminder={reminder} />
                </div>
              ))}
              <button className="text-button reminders-clear" onClick={onClearRecent} type="button">{t("reminders.clear")}</button>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
