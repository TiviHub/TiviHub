import { useState } from "react";
import { formatDate, t } from "../lib/i18n";
import { RowSkeletons } from "./Skeleton";
import type { DownloadRecord, DownloadTask } from "../services/downloads";
import { Icon } from "./common";
import { BrowseShell } from "./BrowseShell";
import { EmptyPanel } from "./EmptyPanel";
import { NavPanel } from "./NavPanel";
import { NoSourceEmptyState } from "./NoSourceEmptyState";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function DownloadsPage({
  downloads,
  tasks,
  loading,
  sourceCount,
  onDelete,
  onCancel,
  onRemoveFailed,
  onRetry,
  onPlay,
  onAddPlaylist,
}: {
  downloads: DownloadRecord[];
  tasks: DownloadTask[];
  loading: boolean;
  sourceCount: number;
  onDelete: (id: string, title: string) => void;
  onCancel: (id: string, title: string) => void;
  onRemoveFailed: (id: string) => void;
  onRetry: (task: DownloadTask) => void;
  onPlay: (download: DownloadRecord) => void;
  onAddPlaylist: () => void;
}) {
  const [picked, setPicked] = useState<"active" | "saved" | null>(null);
  const view = picked ?? (tasks.length > 0 ? "active" : "saved");
  const totalSize = downloads.reduce((total, download) => total + download.sizeBytes, 0);
  const hasItems = downloads.length > 0 || tasks.length > 0;

  if (sourceCount === 0) {
    return <NoSourceEmptyState onAddSource={onAddPlaylist} />;
  }

  return (
    <BrowseShell
      count={view === "active" ? tasks.length : downloads.length}
      label={t("nav.downloads")}
      nav={(
        <NavPanel
          items={[
            { id: "active", label: t("downloads.active"), icon: "download", count: tasks.length },
            { id: "saved", label: downloads.length > 0 ? t("downloads.savedWithSize", { size: formatBytes(totalSize) }) : t("downloads.saved"), icon: "check_circle", count: downloads.length },
          ]}
          onSelect={(id) => setPicked(id as "active" | "saved")}
          selectedId={view}
          title={t("nav.downloads")}
        />
      )}
      title={view === "active" ? t("downloads.active") : t("downloads.savedTitle")}
    >
      {loading ? (
        <div aria-live="polite" role="status">
          <span className="sr-only">{t("downloads.loading")}</span>
          <RowSkeletons artwork count={4} />
        </div>
      ) : (
        <>
          {view === "active" && tasks.length === 0 && <EmptyPanel icon="download" title={t("downloads.idleTitle")}>{t("downloads.idleBody")}</EmptyPanel>}
          {view === "saved" && downloads.length === 0 && (
            <EmptyPanel icon="check_circle" title={t("downloads.emptyTitle")}>{t("downloads.emptyBody")}</EmptyPanel>
          )}
          {view === "active" && tasks.map((task) => {
            const progress = task.totalBytes && task.totalBytes > 0
              ? Math.min(100, (task.receivedBytes / task.totalBytes) * 100)
              : null;
            return (
              <article className={`download-item${task.status === "failed" ? " is-failed" : " is-active"}`} key={task.id}>
                <div className="download-item-artwork">
                  {task.media.artworkUrl
                    ? <img alt="" src={task.media.artworkUrl} />
                    : <Icon name={task.media.contentType === "MOVIE" ? "movie" : "tv"} />}
                </div>
                <div className="download-item-info">
                  <strong>{task.title}</strong>
                  <small>{task.media.contentType === "EPISODE" ? task.media.parentTitle ?? t("downloads.kindEpisode") : t("card.kindMovie")}</small>
                  {task.status === "downloading" ? (
                    <>
                      <div
                        aria-label={progress === null ? t("downloads.receivedAria", { size: formatBytes(task.receivedBytes) }) : t("downloads.progressAria", { percent: Math.round(progress) })}
                        className={`download-progress${progress === null ? " is-indeterminate" : ""}`}
                        role="progressbar"
                        aria-valuemin={progress === null ? undefined : 0}
                        aria-valuemax={progress === null ? undefined : 100}
                        aria-valuenow={progress === null ? undefined : Math.round(progress)}
                      >
                        <span style={progress === null ? undefined : { width: `${progress}%` }} />
                      </div>
                      <small>{task.totalBytes ? t("downloads.of", { received: formatBytes(task.receivedBytes), total: formatBytes(task.totalBytes) }) : t("downloads.downloadedSize", { received: formatBytes(task.receivedBytes) })}</small>
                    </>
                  ) : (
                    <small className="download-item-error">{task.error ?? t("downloads.failed")}</small>
                  )}
                </div>
                {task.status === "downloading" ? (
                  <button
                    aria-label={t("downloads.cancelAria", { title: task.title })}
                    className="icon-button"
                    onClick={() => onCancel(task.id, task.title)}
                    data-tooltip={t("downloads.cancelTooltip")}
                    type="button"
                  >
                    <Icon name="close" />
                  </button>
                ) : (
                  <>
                    <button className="secondary-button" onClick={() => onRetry(task)} type="button">
                      <Icon name="refresh" /> {t("downloads.retry")}
                    </button>
                    <button
                      aria-label={t("downloads.removeFailedAria", { title: task.title })}
                      className="icon-button"
                      data-tooltip={t("downloads.removeFailedTooltip")}
                      onClick={() => onRemoveFailed(task.id)}
                      type="button"
                    >
                      <Icon name="close" />
                    </button>
                  </>
                )}
              </article>
            );
          })}

          {view === "saved" && downloads.map((download) => (
            <article className="download-item is-complete" key={download.id}>
              <div className="download-item-artwork">
                {download.artworkUrl
                  ? <img alt="" src={download.artworkUrl} />
                  : <Icon name={download.contentType === "MOVIE" ? "movie" : "tv"} />}
              </div>
              <div className="download-item-info">
                <strong>{download.title}</strong>
                <small>
                  {download.parentTitle ? `${download.parentTitle} · ` : ""}
                  {t("downloads.sizeDate", { size: formatBytes(download.sizeBytes), date: formatDate(download.completedAt, {}) })}
                </small>
              </div>
              <button
                aria-label={t("downloads.playAria", { title: download.title })}
                className="icon-button download-play-button"
                onClick={() => onPlay(download)}
                data-tooltip={t("downloads.playTooltip")}
                type="button"
              >
                <Icon name="play_arrow" />
              </button>
              <button
                aria-label={t("downloads.deleteAria", { title: download.title })}
                className="icon-button download-delete-button"
                onClick={() => onDelete(download.id, download.title)}
                data-tooltip={t("downloads.deleteTooltip")}
                type="button"
              >
                <Icon name="delete" />
              </button>
            </article>
          ))}
        </>
      )}
      {!loading && hasItems && (
        <p className="panel-note">{t("downloads.note")}</p>
      )}
    </BrowseShell>
  );
}
