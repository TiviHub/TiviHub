import type { RefObject } from "react";
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
            TiviHub<span>.</span>
          </span>
        </div>
        <p className="eyebrow">LOCAL LIBRARY</p>
        <h2 id="startup-progress-title">Opening your library</h2>
        <p id="startup-progress-description">
          Loading your channels, movies, series, and saved progress on this device. Please wait.
        </p>
        <ProgressIndicator label="Library loading progress" />
      </section>
    </div>
  );
}
