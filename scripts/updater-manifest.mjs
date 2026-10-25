const REPO = "https://github.com/TiviHub/TiviHub";

/** The latest.json the in-app updater reads; the signature is the content of the installer's .sig file. */
export function buildUpdaterManifest({ version, notes, signature, date = new Date() }) {
  return {
    version,
    notes,
    pub_date: date.toISOString(),
    platforms: {
      "windows-x86_64": {
        signature,
        url: `${REPO}/releases/download/v${version}/TiviHub-v${version}-windows-x64.exe`,
      },
    },
  };
}
