// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ParentalPinControls } from "../components/ParentalPinControls";
import { useParentalPin } from "../hooks/useParentalPin";

function Harness({ onShow }: { onShow: (show: boolean) => void }) {
  const pin = useParentalPin(vi.fn());
  return <ParentalPinControls onSetShowAdultContent={onShow} pin={pin} showAdultContent={false} />;
}

describe("parental PIN controls", () => {
  beforeEach(() => { window.localStorage.clear(); });
  afterEach(cleanup);

  it("asks for the PIN before showing adult content, and accepts only the right one", async () => {
    const user = userEvent.setup();
    const onShow = vi.fn();
    render(<Harness onShow={onShow} />);

    await user.type(screen.getByLabelText("New PIN (4 to 8 digits)"), "4821");
    await user.type(screen.getByLabelText("Repeat the new PIN"), "4821");
    await user.click(screen.getByRole("button", { name: "Save PIN" }));
    expect(await screen.findByText(/PIN saved/)).toBeTruthy();
    expect(window.localStorage.getItem("tivihub.web.parental-pin")).not.toContain("4821");

    await user.click(screen.getByRole("checkbox"));
    expect(onShow).not.toHaveBeenCalledWith(true);
    await user.type(screen.getByLabelText("Enter your PIN to show adult content"), "0000");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect((await screen.findByRole("alert")).textContent).toBe("That PIN is not correct.");
    expect(onShow).not.toHaveBeenCalledWith(true);

    await user.clear(screen.getByLabelText("Enter your PIN to show adult content"));
    await user.type(screen.getByLabelText("Enter your PIN to show adult content"), "4821");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    await vi.waitFor(() => expect(onShow).toHaveBeenCalledWith(true));
  });

  it("refuses a PIN that is too short or does not match", async () => {
    const user = userEvent.setup();
    render(<Harness onShow={vi.fn()} />);
    await user.type(screen.getByLabelText("New PIN (4 to 8 digits)"), "12");
    await user.type(screen.getByLabelText("Repeat the new PIN"), "12");
    await user.click(screen.getByRole("button", { name: "Save PIN" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Use 4 to 8 digits.");
    expect(window.localStorage.getItem("tivihub.web.parental-pin")).toBeNull();
  });
});
