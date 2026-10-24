export function visibleButton(selector: string): HTMLButtonElement | null {
  return [...document.querySelectorAll<HTMLButtonElement>(selector)]
    .find((button) => button.getClientRects().length > 0) ?? null;
}
