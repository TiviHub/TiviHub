import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { LiveChannel } from "../types";
import {
  checkStreamGroupAvailability,
  type StreamHealthEntryResult,
  type StreamHealthStatus,
} from "../streamHealth";
import { Icon, type IconName } from "./common";

export function StreamHealthCheckDialog({
  channels,
  groupName,
  onClose,
}: {
  channels: LiveChannel[];
  groupName: string;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<"ready" | "checking" | "complete" | "cancelled">("ready");
  const [results, setResults] = useState<StreamHealthEntryResult[]>([]);
  const [completed, setCompleted] = useState(0);
  const [checkError, setCheckError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const availableCount = results.filter((entry) => entry.status === "available").length;
  const unavailableCount = results.filter((entry) => entry.status === "unavailable").length;
  const inconclusiveCount = results.filter((entry) => entry.status === "inconclusive").length;

  useEffect(() => {
    const previousFocus = document.activeElement;
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
  }, [status]);

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function startCheck() {
    const controller = new AbortController();
    controllerRef.current = controller;
    setResults([]);
    setCompleted(0);
    setCheckError(null);
    setStatus("checking");
    try {
      const checked = await checkStreamGroupAvailability(
        channels.map(({ id, name, streamUrl }) => ({ id, name, streamUrl })),
        controller.signal,
        (progress) => {
          setCompleted(progress.completed);
          setResults(progress.results);
        },
      );
      if (controllerRef.current !== controller) return;
      setResults(checked);
      setCompleted(checked.length);
      setStatus("complete");
    } catch (cause) {
      if (controllerRef.current !== controller) return;
      if (controller.signal.aborted || (cause instanceof DOMException && cause.name === "AbortError")) {
        setStatus("cancelled");
      } else {
        setCheckError("The check could not be completed. The stream may still work; try playback directly.");
        setStatus("complete");
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  function cancelCheck() {
    const controller = controllerRef.current;
    controllerRef.current = null;
    controller?.abort();
    setStatus("cancelled");
  }

  function statusLabel(resultStatus: StreamHealthStatus): string {
    if (resultStatus === "available") return "Provider responded";
    if (resultStatus === "unavailable") return "Likely unavailable";
    return "Could not confirm";
  }

  function statusIcon(resultStatus: StreamHealthStatus): IconName {
    if (resultStatus === "available") return "check_circle";
    if (resultStatus === "unavailable") return "error_outline";
    return "info";
  }

  return (
    <div className="modal-backdrop stream-health-backdrop">
      <section
        aria-describedby="stream-health-description"
        aria-labelledby="stream-health-title"
        aria-modal="true"
        className="dialog-card stream-health-dialog"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <p className="eyebrow">CHANNEL CHECK</p>
        <h2 id="stream-health-title">Check group</h2>
        <p className="stream-health-channel">{groupName} · {channels.length} {channels.length === 1 ? "channel" : "channels"}</p>
        <p id="stream-health-description">
          A small request goes directly to your provider. TiviHub does not receive or store the result.
          {" "}Up to three channels are checked at once, with an eight-second timeout per channel.
        </p>

        {status === "checking" && (
          <>
            <div aria-live="polite" className="stream-health-progress" role="status">
              <span aria-hidden="true" className="spinner" />
              <span>Checked {completed} of {channels.length} channels…</span>
            </div>
            <div
              aria-label="Group check progress"
              aria-valuemax={channels.length}
              aria-valuemin={0}
              aria-valuenow={completed}
              className="stream-health-progress-track"
              role="progressbar"
            >
              <span style={{ width: `${channels.length ? (completed / channels.length) * 100 : 0}%` }} />
            </div>
          </>
        )}
        {status === "cancelled" && (
          <div aria-live="polite" className="stream-health-result inconclusive" role="status">
            <Icon name="info" />
            <div>
              <strong>Check cancelled</strong>
              <p>Checked {completed} of {channels.length} channels. Your channel list was not changed.</p>
            </div>
          </div>
        )}
        {results.length > 0 && (
          <>
            {status === "complete" && (
              <div aria-live="polite" className="stream-health-group-summary" role="status">
                <strong>Checked {completed} of {channels.length} channels</strong>
                <p>{availableCount} responded · {unavailableCount} likely unavailable · {inconclusiveCount} inconclusive</p>
              </div>
            )}
            <ul aria-label="Channel check results" className="stream-health-results">
              {results.map((entry) => (
                <li className={entry.status} key={entry.id}>
                  <span>{entry.name}</span>
                  <span className="stream-health-item-status">
                    <Icon name={statusIcon(entry.status)} />
                    {statusLabel(entry.status)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {checkError && <p className="form-error">{checkError}</p>}

        <div className="dialog-actions">
          {status === "checking" ? (
            <button className="secondary-button" onClick={cancelCheck} type="button">
              Cancel check
            </button>
          ) : (
            <>
              <button className="secondary-button" onClick={onClose} type="button">
                Close
              </button>
              <button className="primary-button" onClick={() => void startCheck()} type="button">
                <Icon name={status === "ready" ? "search" : "refresh"} />
                {status === "ready" ? "Start check" : status === "cancelled" ? "Try again" : "Check again"}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
