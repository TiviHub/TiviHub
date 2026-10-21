import type { DownloadRecord, DownloadTask } from "../downloads";
import { Icon } from "./common";
import { HomeEmptyState } from "./HomeEmptyState";
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
  onBrowseMovies,
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
  onBrowseMovies: () => void;
}) {
  const hasItems = downloads.length > 0 || tasks.length > 0;
  const showEmptyState = !loading && !hasItems;

  if (sourceCount === 0) {
    return <NoSourceEmptyState onAddSource={onAddPlaylist} />;
  }

  if (showEmptyState) {
    return (
      <HomeEmptyState
        actionIcon="movie"
        actionLabel="Browse movies"
        artLabel="OFFLINE DOWNLOADS"
        description="Browse movies or episodes and choose Download to save supported videos for offline playback. HLS streams and protected videos can’t be downloaded."
        eyebrow="YOUR OFFLINE LIBRARY"
        onAction={onBrowseMovies}
        title="No downloads yet"
      />
    );
  }

  return (
    <section className="downloads-page">
      <header className="page-intro downloads-page-heading">
        <div>
          <p className="eyebrow">OFFLINE LIBRARY</p>
          <h1>Downloads</h1>
          <p>Movies and episodes saved for offline playback.</p>
        </div>
      </header>

      {loading ? (
        <div aria-live="polite" className="inline-status"><span className="spinner" /> Loading downloads…</div>
      ) : (
        <div className="downloads-list" aria-label="Downloads">
          {tasks.map((task) => {
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
                  <small>{task.media.contentType === "EPISODE" ? task.media.parentTitle ?? "Episode" : "Movie"}</small>
                  {task.status === "downloading" ? (
                    <>
                      <div
                        aria-label={progress === null ? `Downloaded ${formatBytes(task.receivedBytes)}` : `Download progress ${Math.round(progress)}%`}
                        className={`download-progress${progress === null ? " is-indeterminate" : ""}`}
                        role="progressbar"
                        aria-valuemin={progress === null ? undefined : 0}
                        aria-valuemax={progress === null ? undefined : 100}
                        aria-valuenow={progress === null ? undefined : Math.round(progress)}
                      >
                        <span style={progress === null ? undefined : { width: `${progress}%` }} />
                      </div>
                      <small>{formatBytes(task.receivedBytes)}{task.totalBytes ? ` of ${formatBytes(task.totalBytes)}` : " downloaded"}</small>
                    </>
                  ) : (
                    <small className="download-item-error">{task.error ?? "Download failed."}</small>
                  )}
                </div>
                {task.status === "downloading" ? (
                  <button
                    aria-label={`Cancel download of ${task.title}`}
                    className="icon-button"
                    onClick={() => onCancel(task.id, task.title)}
                    data-tooltip="Cancel download"
                    type="button"
                  >
                    <Icon name="close" />
                  </button>
                ) : (
                  <>
                    <button className="secondary-button" onClick={() => onRetry(task)} type="button">
                      <Icon name="refresh" /> Retry
                    </button>
                    <button
                      aria-label={`Remove failed download of ${task.title}`}
                      className="icon-button"
                      data-tooltip="Remove failed download"
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

          {downloads.map((download) => (
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
                  {formatBytes(download.sizeBytes)} · Downloaded {new Date(download.completedAt).toLocaleDateString()}
                </small>
              </div>
              <button
                aria-label={`Play downloaded ${download.title}`}
                className="icon-button download-play-button"
                onClick={() => onPlay(download)}
                data-tooltip="Play offline"
                type="button"
              >
                <Icon name="play_arrow" />
              </button>
              <button
                aria-label={`Delete downloaded ${download.title}`}
                className="icon-button download-delete-button"
                onClick={() => onDelete(download.id, download.title)}
                data-tooltip="Delete download"
                type="button"
              >
                <Icon name="delete" />
              </button>
            </article>
          ))}
        </div>
      )}
      {!loading && hasItems && (
        <p className="downloads-format-note">
          Offline downloads support direct, non-DRM video files only. HLS streams and protected videos can’t be saved.
        </p>
      )}
    </section>
  );
}
