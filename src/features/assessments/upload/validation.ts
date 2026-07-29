import { z } from "zod";

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_SESSION_FILES = 10;

const supportedCsvTypes = new Set(["", "text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"]);

export type CsvFileDescriptor = { name: string; type: string; size: number };

export const sessionUploadSchema = z.object({
  hand: z.enum(["left", "right"]),
  declaredAt: z.iso.datetime({ offset: true }),
  protocolAdherence: z.literal(true),
  bodyWeightKg: z.number().finite().positive().optional(),
});

export function validateCsvFiles(files: readonly CsvFileDescriptor[]) {
  const errors: string[] = [];
  if (files.length === 0) errors.push("Choose at least one CSV file.");
  if (files.length > MAX_SESSION_FILES) errors.push(`A session can contain at most ${MAX_SESSION_FILES} files.`);

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".csv")) errors.push(`${file.name} must use a .csv filename.`);
    if (!supportedCsvTypes.has(file.type.toLowerCase())) errors.push(`${file.name} has an unsupported file type.`);
    if (!Number.isSafeInteger(file.size) || file.size <= 0) errors.push(`${file.name} is empty or has an invalid size.`);
    else if (file.size > MAX_CSV_BYTES) errors.push(`${file.name} exceeds the 5 MiB limit.`);
  }
  return errors;
}

