import { formatNumber, t } from "../lib/i18n";
import { ProgressIndicator } from "./ProgressIndicator";

interface PlaylistDeletionProgressProps {
  name: string;
  completed: number;
  total: number;
  phase: "preparing" | "deleting" | "updating";
}

export function PlaylistDeletionProgress({
  name,
  completed,
  total,
  phase,
}: PlaylistDeletionProgressProps) {
  const deleting = phase === "deleting";

  return (
    <div
      aria-describedby="delete-progress-description"
      aria-labelledby="delete-progress-title"
      aria-modal="true"
      className="refresh-overlay"
      role="dialog"
      tabIndex={-1}
    >
      <section className="refresh-progress-card">
        <span aria-hidden="true" className="spinner refresh-progress-spinner" />
        <p className="eyebrow">{phase === "updating" ? t("deletion.eyebrowUpdating") : t("deletion.eyebrowData")}</p>
        <h2 id="delete-progress-title">
          {phase === "preparing" ? t("deletion.preparing") : deleting ? t("deletion.deleting") : t("deletion.updating")}
        </h2>
        <p aria-live="polite" id="delete-progress-description">
          {phase === "preparing"
            ? t("deletion.checking", { name })
            : deleting
              ? t("deletion.removing", { name, completed: formatNumber(completed), total: formatNumber(total) })
              : t("deletion.finishing", { name })}
        </p>
        <ProgressIndicator
          label={deleting
            ? t("deletion.progressDeleting")
            : phase === "preparing" ? t("deletion.preparing") : t("deletion.progressLibrary")}
          {...(deleting && total > 0 ? { max: total, value: completed } : {})}
        />
      </section>
    </div>
  );
}
