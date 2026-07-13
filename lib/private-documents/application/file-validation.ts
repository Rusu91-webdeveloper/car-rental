import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import { DOCUMENT_FILE_POLICY } from "../domain/types";
import { documentError } from "../domain/errors";

const UNSAFE_EXTENSIONS = new Set([
  ".exe",
  ".com",
  ".bat",
  ".cmd",
  ".js",
  ".html",
  ".htm",
  ".svg",
  ".zip",
  ".rar",
  ".7z",
  ".docm",
  ".xlsm",
  ".pptm",
]);
const ACTIVE_PDF_MARKERS = [
  "/JavaScript",
  "/JS",
  "/Launch",
  "/EmbeddedFile",
  "/OpenAction",
  "/AA",
  "/RichMedia",
  "/XFA",
  "/AcroForm",
];

export interface ValidatedDocumentFile {
  normalizedExtension: ".pdf" | ".jpg" | ".jpeg" | ".png";
  declaredMimeType: "application/pdf" | "image/jpeg" | "image/png";
  detectedMimeType: "application/pdf" | "image/jpeg" | "image/png";
  detectedFileType: "PDF" | "JPEG" | "PNG";
  sizeBytes: number;
  checksumSha256: string;
}

export function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeExtension(name: string) {
  if (
    !name ||
    name !== basename(name) ||
    /[\\/\0\x00-\x1f\x7f]/.test(name) ||
    name.startsWith(".") ||
    name.length > 255
  )
    documentError("DOCUMENT_FILENAME_UNSAFE", "The filename is unsafe.");
  const lower = name.toLowerCase().normalize("NFKC");
  const extension = extname(lower);
  if (!DOCUMENT_FILE_POLICY.allowedExtensions.includes(extension as never))
    documentError(
      "DOCUMENT_EXTENSION_UNSUPPORTED",
      "The extension is unsupported.",
    );
  if (UNSAFE_EXTENSIONS.has(extname(lower.slice(0, -extension.length))))
    documentError(
      "DOCUMENT_FILENAME_UNSAFE",
      "Unsafe double extensions are rejected.",
    );
  return extension as ValidatedDocumentFile["normalizedExtension"];
}

function detect(bytes: Uint8Array) {
  if (
    bytes.length >= 8 &&
    Buffer.from(bytes.subarray(0, 8)).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    if (
      !Buffer.from(bytes.subarray(Math.max(0, bytes.length - 16)))
        .toString("latin1")
        .includes("IEND")
    )
      documentError(
        "DOCUMENT_SIGNATURE_INVALID",
        "The PNG structure is incomplete.",
      );
    return {
      mime: "image/png" as const,
      type: "PNG" as const,
      extensions: [".png"],
    };
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes.at(-2) === 0xff &&
    bytes.at(-1) === 0xd9
  )
    return {
      mime: "image/jpeg" as const,
      type: "JPEG" as const,
      extensions: [".jpg", ".jpeg"],
    };
  if (
    Buffer.from(bytes.subarray(0, 8)).toString("latin1").startsWith("%PDF-")
  ) {
    const text = Buffer.from(bytes).toString("latin1");
    if (!text.trimEnd().endsWith("%%EOF"))
      documentError(
        "DOCUMENT_SIGNATURE_INVALID",
        "The PDF structure is incomplete.",
      );
    if (ACTIVE_PDF_MARKERS.some((marker) => text.includes(marker)))
      documentError(
        "DOCUMENT_ACTIVE_CONTENT_REJECTED",
        "PDF active content is rejected.",
      );
    return {
      mime: "application/pdf" as const,
      type: "PDF" as const,
      extensions: [".pdf"],
    };
  }
  documentError(
    "DOCUMENT_SIGNATURE_INVALID",
    "The file signature is unsupported.",
  );
}

export function validateDocumentFile(input: {
  originalFileName: string;
  declaredMimeType: string;
  bytes: Uint8Array;
  maximumBytes?: number;
  expectedChecksumSha256?: string;
}): ValidatedDocumentFile {
  const maximum = input.maximumBytes ?? DOCUMENT_FILE_POLICY.maximumBytes;
  if (!input.bytes.length)
    documentError("DOCUMENT_FILE_EMPTY", "Empty files are rejected.");
  if (input.bytes.length > maximum)
    documentError(
      "DOCUMENT_FILE_TOO_LARGE",
      "The file exceeds the size limit.",
    );
  if (
    !DOCUMENT_FILE_POLICY.allowedMimeTypes.includes(
      input.declaredMimeType as never,
    )
  )
    documentError("DOCUMENT_MIME_UNSUPPORTED", "The MIME type is unsupported.");
  const extension = safeExtension(input.originalFileName);
  const detected = detect(input.bytes);
  if (detected.mime !== input.declaredMimeType)
    documentError(
      "DOCUMENT_MIME_MISMATCH",
      "Declared and detected MIME types differ.",
    );
  if (!detected.extensions.includes(extension))
    documentError(
      "DOCUMENT_EXTENSION_MISMATCH",
      "Extension and signature differ.",
    );
  const checksum = sha256(input.bytes);
  if (
    input.expectedChecksumSha256 &&
    checksum !== input.expectedChecksumSha256.toLowerCase()
  )
    documentError(
      "DOCUMENT_UPLOAD_METADATA_MISMATCH",
      "Checksum differs from the upload intent.",
    );
  return {
    normalizedExtension: extension,
    declaredMimeType:
      input.declaredMimeType as ValidatedDocumentFile["declaredMimeType"],
    detectedMimeType: detected.mime,
    detectedFileType: detected.type,
    sizeBytes: input.bytes.length,
    checksumSha256: checksum,
  };
}
