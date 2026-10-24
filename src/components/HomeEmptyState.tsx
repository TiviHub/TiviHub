import type { ReactNode } from "react";
import { t } from "../lib/i18n";
import { Icon, type IconName } from "./common";

const ASSET_BASE_URL = import.meta.env.BASE_URL;

export function HomeEmptyState({
  eyebrow,
  title,
  description,
  actionLabel,
  actionIcon,
  onAction,
  artLabel,
  className = "",
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  actionIcon: IconName;
  onAction: () => void;
  artLabel?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section aria-labelledby="home-empty-title" className={`home-empty${className ? ` ${className}` : ""}`}>
      <div className="home-empty-panel">
        <div className="home-empty-prompt">
          <p className="eyebrow">{eyebrow}</p>
          <h1 id="home-empty-title">{title}</h1>
          <p className="home-empty-description">{description}</p>
          <button className="primary-button home-empty-action" onClick={onAction} type="button">
            <Icon name={actionIcon} />
            {actionLabel}
            <Icon name="arrow_forward" />
          </button>
          {children}
        </div>
        <div aria-hidden="true" className="home-empty-art">
          <div className="home-empty-orbit home-empty-orbit-outer" />
          <div className="home-empty-orbit home-empty-orbit-inner" />
          <div className="home-empty-logo-core">
            <img alt="" src={`${ASSET_BASE_URL}icons/tivihub-512.png`} />
          </div>
          <span className="home-empty-star home-empty-star-one">✦</span>
          <span className="home-empty-star home-empty-star-two">✧</span>
          <span className="home-empty-caption">TIVIHUB / DESKTOP</span>
          <div className="home-empty-art-card home-empty-art-card-top">
            <Icon name="movie" /><span>{artLabel ?? t("home.yourLibrary")}</span>
          </div>
          <div className="home-empty-art-card home-empty-art-card-bottom">
            <span className="home-empty-art-pulse" /><span>{t("home.ready")}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
