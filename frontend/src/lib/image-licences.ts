/**
 * The licences an admin can pick for an image, and the deed each links to.
 *
 * The labels match what the Commons ingest writes (`LicenseShortName`, e.g.
 * "CC BY-SA 4.0") so a hand-entered image and a backfilled one render the same
 * credit line. The last three carry no public deed: "Used with permission" and
 * "Manufacturer press image" are permissions we hold, not licences the reader
 * can rely on, and "All rights reserved" is the honest default for a photo we
 * took ourselves or were given.
 */
export const IMAGE_LICENCES: ReadonlyArray<{ label: string; url?: string }> = [
  { label: "CC0 1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/" },
  { label: "Public domain", url: "https://creativecommons.org/publicdomain/mark/1.0/" },
  { label: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
  { label: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
  { label: "CC BY 3.0", url: "https://creativecommons.org/licenses/by/3.0/" },
  { label: "CC BY-SA 3.0", url: "https://creativecommons.org/licenses/by-sa/3.0/" },
  { label: "CC BY 2.0", url: "https://creativecommons.org/licenses/by/2.0/" },
  { label: "CC BY-SA 2.0", url: "https://creativecommons.org/licenses/by-sa/2.0/" },
  { label: "Used with permission" },
  { label: "Manufacturer press image" },
  { label: "All rights reserved" },
];

/** The deed for a preset label, or undefined when the label is not a preset. */
export function licenceUrlFor(label: string): string | undefined {
  return IMAGE_LICENCES.find((l) => l.label === label)?.url;
}
