import type { ReactNode } from "react";
import { Icon, type IconName } from "./common";

/**
 * Every "nothing here" and "could not load" message inside a panel: an icon, a title, one sentence and at most one action.
 * (The page-sized "Add your first source" screen is `HomeEmptyState`; it has the same parts, set larger.)
 */
export function EmptyPanel({ icon, title, children, action, error = false, compact = false, className = "" }: {
  icon: IconName;
  title: string;
  /** One sentence that says what to do next. */
  children?: ReactNode;
  /** A single button (secondary-button; "Try again" on errors). */
  action?: ReactNode;
  /** A failed request: announced to screen readers and tinted. */
  error?: boolean;
  /** A line inside a small strip (the guide under the player) instead of a panel-sized block. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={`empty-panel${error ? " is-error" : ""}${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`} role={error ? "alert" : undefined}>
      <span aria-hidden="true" className="empty-panel-icon"><Icon name={icon} /></span>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
