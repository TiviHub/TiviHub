import { Icon } from "./common";
import { RowSkeletons } from "./Skeleton";
import type { CastDeviceInfo } from "../lib/playbackMedia";

export function CastPanel({
  castBusy,
  castDevices,
  castError,
  castingDevice,
  diagnosticCopyMessage,
  drm,
  copyDiagnostics,
  openCastPanel,
  castToDevice,
}: {
  castBusy: boolean;
  castDevices: CastDeviceInfo[];
  castError: string | null;
  castingDevice: CastDeviceInfo | null;
  diagnosticCopyMessage: string | null;
  drm: boolean;
  copyDiagnostics: () => Promise<void>;
  openCastPanel: () => Promise<void>;
  castToDevice: (device: CastDeviceInfo) => Promise<void>;
}) {
  return (
      <section aria-label="Cast to a device" className="cast-panel">
        <div className="cast-panel-heading">
          <strong>Google Cast devices</strong>
          <button
            className="text-button"
            disabled={castBusy}
            onClick={() => void openCastPanel()}
            type="button"
          >
            {castBusy ? "Searching…" : "Refresh"}
          </button>
        </div>
        {castError && (
          <div className="playback-error-actions">
            <p className="form-error" role="alert">{castError}</p>
            <button className="text-button" onClick={() => void copyDiagnostics()} type="button">
              <Icon name="content_copy" />
              Copy error details
            </button>
            {diagnosticCopyMessage && (
              <p aria-live="polite" className="playback-error-copy-status">{diagnosticCopyMessage}</p>
            )}
          </div>
        )}
        {castBusy && castDevices.length === 0 && (
          <div aria-live="polite" role="status">
            <span className="sr-only">Searching for Google Cast devices…</span>
            <RowSkeletons count={2} />
          </div>
        )}
        {castDevices.length > 0 && (
          <ul className="cast-device-list">
            {castDevices.map((device) => (
              <li key={device.address}>
                <button
                  className="secondary-button"
                  disabled={castBusy || drm || Boolean(castingDevice)}
                  onClick={() => void castToDevice(device)}
                  type="button"
                >
                  <Icon name={castingDevice?.address === device.address ? "cast_connected" : "cast"} />
                  {device.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!castBusy && castDevices.length === 0 && !castError && (
          <p className="form-note">No Chromecast devices found on your local network.</p>
        )}
        <p className="form-note">
          The Chromecast fetches the stream directly from your provider. TiviHub does not relay media.
        </p>
      </section>
  );
}
