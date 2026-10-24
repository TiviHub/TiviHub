import type { RefObject } from "react";
import { t } from "../lib/i18n";
import { ProgressIndicator } from "./ProgressIndicator";

export function StartupScreen({
  animate,
  logoSrc,
  screenRef,
}: {
  animate: boolean;
  logoSrc: string;
  screenRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      aria-describedby="startup-progress-description"
      aria-labelledby="startup-progress-title"
      aria-modal="true"
      className="refresh-overlay startup-overlay"
      ref={screenRef}
      role="dialog"
      tabIndex={-1}
    >
      <section className="refresh-progress-card startup-progress-card">
        <div className="startup-brand">
          <span className={`launch-intro-mark${animate ? " is-animating" : ""}`}>
            <img alt="" src={logoSrc} />
          </span>
          <span className={`launch-intro-wordmark${animate ? " is-animating" : ""}`}>
            TiviHub
          </span>
        </div>
        <p className="eyebrow">{t("startup.eyebrow")}</p>
        <h2 id="startup-progress-title">{t("startup.title")}</h2>
        <p id="startup-progress-description">
          {t("startup.description")}
        </p>
        <ProgressIndicator label={t("startup.progress")} />
      </section>
    </div>
  );
}
