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
        <p className="eyebrow">{phase === "updating" ? "LIBRARY UPDATE" : "LOCAL DATA"}</p>
        <h2 id="delete-progress-title">
          {phase === "preparing" ? "Preparing playlist deletion" : deleting ? "Deleting playlist" : "Updating your library"}
        </h2>
        <p aria-live="polite" id="delete-progress-description">
          {phase === "preparing"
            ? `Checking the local data linked to “${name}” before removing it.`
            : deleting
              ? `Removing “${name}” and its saved catalog data. ${completed.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} records deleted.`
              : `Finishing the removal of “${name}” and loading your remaining sources.`}
        </p>
        <ProgressIndicator
          label={deleting
            ? "Playlist deletion progress"
            : phase === "preparing" ? "Preparing playlist deletion" : "Library update progress"}
          {...(deleting && total > 0 ? { max: total, value: completed } : {})}
        />
      </section>
    </div>
  );
}
