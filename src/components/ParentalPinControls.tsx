import { useState, type FormEvent } from "react";
import type { ParentalPin, PinCheck } from "../hooks/useParentalPin";
import { t } from "../lib/i18n";
import { isValidPin } from "../lib/parentalPin";
import { Icon } from "./common";

function describe(result: PinCheck): string | null {
  if (result === "ok") return null;
  return result === "wrong" ? t("pin.wrong") : t("pin.locked", { seconds: result.lockedSeconds });
}

/** The "show adult content" switch, and the PIN that guards it. */
export function ParentalPinControls({ pin, showAdultContent, onSetShowAdultContent }: {
  pin: ParentalPin;
  showAdultContent: boolean;
  onSetShowAdultContent: (show: boolean) => void;
}) {
  const [unlocking, setUnlocking] = useState(false);
  const [unlockPin, setUnlockPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [repeatPin, setRepeatPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function reset(message: string | null = null) {
    setUnlocking(false);
    setUnlockPin("");
    setCurrentPin("");
    setNewPin("");
    setRepeatPin("");
    setError(null);
    setNotice(message);
  }

  function toggle(checked: boolean) {
    setNotice(null);
    if (checked && pin.pinSet) {
      setUnlocking(true);
      return;
    }
    reset();
    onSetShowAdultContent(checked);
  }

  async function unlock(event: FormEvent) {
    event.preventDefault();
    const message = describe(await pin.check(unlockPin));
    if (message) {
      setError(message);
      return;
    }
    reset();
    onSetShowAdultContent(true);
  }

  function validNewPin(): boolean {
    if (!isValidPin(newPin)) setError(t("pin.invalid"));
    else if (newPin !== repeatPin) setError(t("pin.mismatch"));
    else return true;
    return false;
  }

  async function createPin(event: FormEvent) {
    event.preventDefault();
    if (!validNewPin()) return;
    if (await pin.setPin(newPin)) {
      onSetShowAdultContent(false);
      reset(t("pin.saved"));
    }
  }

  async function changePin() {
    if (!validNewPin()) return;
    const message = describe(await pin.check(currentPin));
    if (message) {
      setError(message);
      return;
    }
    if (await pin.setPin(newPin)) reset(t("pin.changed"));
  }

  async function removePin() {
    const message = describe(await pin.clearPin(currentPin));
    if (message) setError(message);
    else reset(t("pin.removed"));
  }

  return (
    <>
      <label className="adult-content-toggle">
        <span>
          <strong>{t("settings.adult.toggle")}</strong>
          <small>{t("settings.adult.hint")}</small>
        </span>
        <input checked={showAdultContent || unlocking} onChange={(event) => toggle(event.target.checked)} type="checkbox" />
      </label>

      {unlocking && (
        <form className="settings-form" onSubmit={(event) => void unlock(event)}>
          <label className="form-field">
            <span>{t("pin.enter")}</span>
            <input
              autoComplete="off" autoFocus inputMode="numeric" maxLength={8}
              onChange={(event) => { setUnlockPin(event.target.value); setError(null); }}
              type="password" value={unlockPin}
            />
          </label>
          <div className="settings-actions">
            <button className="secondary-button" type="submit"><Icon name="lock" /> {t("pin.unlock")}</button>
            <button className="text-button" onClick={() => reset()} type="button">{t("dlg.cancel")}</button>
          </div>
        </form>
      )}

      {!pin.pinSet ? (
        <form className="settings-form" onSubmit={(event) => void createPin(event)}>
          <h3>{t("pin.heading")}</h3>
          <p className="form-note">{t("pin.intro")}</p>
          <label className="form-field">
            <span>{t("pin.newLabel")}</span>
            <input autoComplete="off" inputMode="numeric" maxLength={8} onChange={(event) => { setNewPin(event.target.value); setError(null); }} type="password" value={newPin} />
          </label>
          <label className="form-field">
            <span>{t("pin.repeat")}</span>
            <input autoComplete="off" inputMode="numeric" maxLength={8} onChange={(event) => { setRepeatPin(event.target.value); setError(null); }} type="password" value={repeatPin} />
          </label>
          <button className="secondary-button" type="submit"><Icon name="lock" /> {t("pin.save")}</button>
        </form>
      ) : (
        <form className="settings-form" onSubmit={(event) => event.preventDefault()}>
          <h3>{t("pin.heading")}</h3>
          <label className="form-field">
            <span>{t("pin.current")}</span>
            <input autoComplete="off" inputMode="numeric" maxLength={8} onChange={(event) => { setCurrentPin(event.target.value); setError(null); }} type="password" value={currentPin} />
          </label>
          <label className="form-field">
            <span>{t("pin.newLabelOptional")}</span>
            <input autoComplete="off" inputMode="numeric" maxLength={8} onChange={(event) => { setNewPin(event.target.value); setError(null); }} type="password" value={newPin} />
          </label>
          <label className="form-field">
            <span>{t("pin.repeat")}</span>
            <input autoComplete="off" inputMode="numeric" maxLength={8} onChange={(event) => { setRepeatPin(event.target.value); setError(null); }} type="password" value={repeatPin} />
          </label>
          <div className="settings-actions">
            <button className="secondary-button" onClick={() => void changePin()} type="button">{t("pin.change")}</button>
            <button className="secondary-button danger-button" onClick={() => void removePin()} type="button">{t("pin.remove")}</button>
          </div>
        </form>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="settings-message" role="status">{notice}</p>}
    </>
  );
}
