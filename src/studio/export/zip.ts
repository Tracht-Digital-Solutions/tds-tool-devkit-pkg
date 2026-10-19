/**
 * The ZIP writer for the design-system export: stored entries, deterministic
 * bytes, the zip-slip guard and a reader for the tests. Moved to tds-shared
 * (`./zip`, 0.59) when the image compressor needed the same container; this
 * module keeps the pack's import path.
 */
export { crc32, createZip, readZip, safeZipPath, type ZipEntry } from "@tracht-digital-solutions/tds-shared/zip";
