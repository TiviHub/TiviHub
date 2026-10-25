export function buildUpdaterManifest(options: {
  version: string;
  notes: string;
  signature: string;
  date?: Date;
}): {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, { signature: string; url: string }>;
};
