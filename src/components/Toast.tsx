import type { ReactNode } from "react";
import { t } from "../lib/i18n";
import { Icon } from "./common";

/**
 * A message that floats over the page (bottom right): a confirmation or a failure, one or two sentences, dismissible.
 * A flat raised card with a bar on its left edge in the message colour (green for a notice, red for an error).
 */
export function Toast({ kind, children, onDismiss }: { kind: "notice" | "error"; children: ReactNode; onDismiss: () => void }) {
  return (
    <div className={`toast is-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <span aria-hidden="true" className="toast-icon"><Icon name={kind === "error" ? "error_outline" : "check_circle"} /></span>
      <p>{children}</p>
      <button aria-label={t("toast.dismiss")} className="icon-button" data-tooltip={t("toast.dismissTooltip")} onClick={onDismiss} type="button">
        <Icon name="close" />
      </button>
    </div>
  );
}
