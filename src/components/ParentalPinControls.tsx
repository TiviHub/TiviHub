import { useState, type FormEvent } from "react";
import type { ParentalPin, PinCheck } from "../hooks/useParentalPin";
import { t } from "../lib/i18n";
import { isValidPin } from "../lib/parentalPin";
import { Icon } from "./common";

function describe(result: PinCheck): string | null {
  if (result === "ok") return null;
  return result === "wrong" ? t("pin.wrong") : t("pin.locked", { seconds: result.lockedSeconds });
}

function PinField({ label, value, onChange, autoFocus = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input
        autoComplete="off" autoFocus={autoFocus} inputMode="numeric" maxLength={8}
        onChange={(event) => onChange(event.target.value)} type="password" value={value}
      />
    </label>
  );
}

/** The "show adult content" switch. With a PIN set, turning it on asks for the PIN first. */
export function AdultContentToggle({ pin, showAdultContent, onSetShowAdultContent }: {
  pin: ParentalPin;
  showAdultContent: boolean;
  onSetShowAdultContent: (show: boolean) => void;
}) {
  const [unlocking, setUnlocking] = useState(false);
  const [unlockPin, setUnlockPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  function stopUnlocking() {
    setUnlocking(false);
    setUnlockPin("");
    setError(null);
  }

  function toggle(checked: boolean) {
    if (checked && pin.pinSet) {
      setUnlocking(true);
      return;
    }
    stopUnlocking();
    onSetShowAdultContent(checked);
  }

  async function unlock(event: FormEvent) {
    event.preventDefault();
    const message = describe(await pin.check(unlockPin));
    if (message) {
      setError(message);
      return;
    }
    stopUnlocking();
    onSetShowAdultContent(true);
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
          <PinField autoFocus label={t("pin.enter")} onChange={(value) => { setUnlockPin(value); setError(null); }} value={unlockPin} />
          <div className="settings-actions">
            <button className="secondary-button" type="submit"><Icon name="lock" /> {t("pin.unlock")}</button>
            <button className="text-button" onClick={stopUnlocking} type="button">{t("dlg.cancel")}</button>
          </div>
        </form>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </>
  );
}

/** Setting, changing and removing the PIN. */
export function PinSettings({ pin, onSetShowAdultContent }: {
  pin: ParentalPin;
  onSetShowAdultContent: (show: boolean) => void;
}) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [repeatPin, setRepeatPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function reset(message: string | null = null) {
    setCurrentPin("");
    setNewPin("");
    setRepeatPin("");
    setError(null);
    setNotice(message);
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

  const edit = (setter: (value: string) => void) => (value: string) => { setter(value); setError(null); };

  return (
    <form className="settings-form" onSubmit={(event) => void createPin(event)}>
      {pin.pinSet && <PinField label={t("pin.current")} onChange={edit(setCurrentPin)} value={currentPin} />}
      <div className="form-row">
        <PinField label={pin.pinSet ? t("pin.newLabelOptional") : t("pin.newLabel")} onChange={edit(setNewPin)} value={newPin} />
        <PinField label={t("pin.repeat")} onChange={edit(setRepeatPin)} value={repeatPin} />
      </div>
      <div className="settings-actions">
        {pin.pinSet ? (
          <>
            <button className="secondary-button" onClick={() => void changePin()} type="button">{t("pin.change")}</button>
            <button className="secondary-button danger-button" onClick={() => void removePin()} type="button">{t("pin.remove")}</button>
          </>
        ) : (
          <button className="secondary-button" type="submit"><Icon name="lock" /> {t("pin.save")}</button>
        )}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="settings-message" role="status">{notice}</p>}
    </form>
  );
}
