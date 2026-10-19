// @vitest-environment jsdom
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressIndicator } from "../components/ProgressIndicator";
import { StartupScreen } from "../components/StartupScreen";

describe("shared loading UI", () => {
  it("renders indeterminate and bounded progress with accessible values", () => {
    render(
      <>
        <ProgressIndicator label="Loading library" />
        <ProgressIndicator label="Saving catalog" max={10} value={12} />
      </>,
    );

    expect(screen.getByRole("progressbar", { name: "Loading library" }).getAttribute("aria-valuenow")).toBeNull();
    const savingProgress = screen.getByRole("progressbar", { name: "Saving catalog" });
    expect(savingProgress.getAttribute("aria-valuenow")).toBe("10");
    expect((savingProgress.firstElementChild as HTMLElement).style.width).toBe("100%");
  });

  it("combines the logo intro and opening-library screen", () => {
    render(
      <StartupScreen
        animate
        logoSrc="/icons/tivihub.svg"
        screenRef={createRef<HTMLDivElement>()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Opening your library" })).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Library loading progress" })).toBeTruthy();
    expect(document.querySelector(".launch-intro-mark.is-animating")).not.toBeNull();
  });
});
