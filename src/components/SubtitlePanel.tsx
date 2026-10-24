import { t } from "../lib/i18n";
import { EmptyPanel } from "./EmptyPanel";
import type { SubtitleResult } from "../providers/opensubtitles";
import { Icon, SearchField } from "./common";
import { RowSkeletons } from "./Skeleton";

export function SubtitlePanel({
  subtitleQuery,
  setSubtitleQuery,
  subtitleBusy,
  subtitleError,
  subtitleResults,
  subtitleApiKey,
  savedSubtitles,
  searchSubtitles,
  downloadSubtitle,
  applySavedSubtitle,
  forgetSavedSubtitle,
}: {
  subtitleQuery: string;
  setSubtitleQuery: (value: string) => void;
  subtitleBusy: boolean;
  subtitleError: string | null;
  subtitleResults: SubtitleResult[];
  subtitleApiKey: string;
  savedSubtitles: { fileId: number; name: string }[];
  searchSubtitles: () => Promise<void>;
  downloadSubtitle: (result: SubtitleResult) => Promise<void>;
  applySavedSubtitle: (fileId: number) => Promise<void>;
  forgetSavedSubtitle: (fileId: number) => Promise<void>;
}) {
  return (
      <section className="subtitle-panel" aria-label={t("sub.searchTitle")}>
        <div className="subtitle-column">
          <strong className="subtitle-column-title">{t("sub.searchTitle")}</strong>
          <form
            className="subtitle-search"
            onSubmit={(event) => {
              event.preventDefault();
              void searchSubtitles();
            }}
          >
            <SearchField label={t("sub.searchLabel")} onChange={setSubtitleQuery} placeholder={t("sub.placeholder")} value={subtitleQuery} />
            <button className="secondary-button selected" disabled={subtitleBusy} type="submit">
              {subtitleBusy ? t("sub.searching") : t("sub.search")}
            </button>
          </form>
          {subtitleError && <p className="form-error" role="alert">{subtitleError}</p>}
          {subtitleBusy && subtitleResults.length === 0 && (
            <div aria-live="polite" role="status">
              <span className="sr-only">{t("sub.searchingSr")}</span>
              <RowSkeletons count={3} />
            </div>
          )}
          {subtitleResults.length > 0 && (
            <ul className="subtitle-results">
              {subtitleResults.slice(0, 20).map((result) => (
                <li key={`${result.fileId}:${result.fileName}`}>
                  <span>
                    <strong>{result.fileName}</strong>
                    <small>{result.language}{result.release ? ` · ${result.release}` : ""}</small>
                  </span>
                  <button
                    aria-label={t("sub.downloadAria", { name: result.fileName })}
                    className="icon-button"
                    data-tooltip={t("sub.download")}
                    disabled={subtitleBusy}
                    onClick={() => void downloadSubtitle(result)}
                    type="button"
                  >
                    <Icon name="download" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!subtitleApiKey && (
            <p className="form-note">{t("sub.needKey")}</p>
          )}
        </div>
        <div className="subtitle-column">
          <strong className="subtitle-column-title">
            {t("sub.saved")}
            {savedSubtitles.length > 0 && <span className="subtitle-count">{savedSubtitles.length}</span>}
          </strong>
          {savedSubtitles.length === 0 && (
            <EmptyPanel icon="subtitles" title={t("downloads.emptyTitle")}>{t("sub.nothingSavedBody")}</EmptyPanel>
          )}
          {savedSubtitles.length > 0 && (
            <ul className="subtitle-results">
              {savedSubtitles.map((saved) => (
                <li key={saved.fileId}>
                  <span><strong>{saved.name}</strong></span>
                  <button
                    aria-label={t("sub.useAria", { name: saved.name })}
                    className="icon-button"
                    data-tooltip={t("sub.use")}
                    onClick={() => void applySavedSubtitle(saved.fileId)}
                    type="button"
                  >
                    <Icon name="subtitles" />
                  </button>
                  <button
                    aria-label={t("sub.removeAria", { name: saved.name })}
                    className="icon-button"
                    data-tooltip={t("sub.remove")}
                    onClick={() => void forgetSavedSubtitle(saved.fileId)}
                    type="button"
                  >
                    <Icon name="delete" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
  );
}
