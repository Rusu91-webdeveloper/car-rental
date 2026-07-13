import { createHash } from "node:crypto";
import { documentError } from "../domain/errors";

const PATHNAME =
  /^private-documents\/[a-z0-9][a-z0-9-]{0,31}\/[a-f0-9]{32}\/[a-f0-9]{48}\.(?:pdf|jpe?g|png)$/;
const INTENT_ID = /^[A-Za-z0-9_-]{16,128}$/;

function hash(value: string, length: number) {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

export function assertVercelBlobPathname(pathname: string) {
  if (
    !PATHNAME.test(pathname) ||
    pathname.includes("..") ||
    pathname.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(pathname) ||
    pathname.split("/").some((segment) => !segment)
  )
    documentError("DOCUMENT_PATHNAME_INVALID", "Blob pathname is invalid.");
  return pathname;
}

export function environmentBlobPrefix(environmentId: string) {
  const sentinel = `private-documents/${environmentId}/${"a".repeat(32)}/${"b".repeat(48)}.pdf`;
  assertVercelBlobPathname(sentinel);
  return `private-documents/${environmentId}/`;
}

export function createVercelBlobPathname(input: {
  environmentId: string;
  uploadIntentId: string;
  normalizedExtension: ".pdf" | ".jpg" | ".jpeg" | ".png";
}) {
  if (!INTENT_ID.test(input.uploadIntentId))
    documentError("DOCUMENT_PATHNAME_INVALID", "Upload intent is invalid.");
  const scope = `${input.environmentId}:${input.uploadIntentId}`;
  return assertVercelBlobPathname(
    `private-documents/${input.environmentId}/${hash(`slot:${scope}`, 32)}/${hash(`object:${scope}`, 48)}${input.normalizedExtension}`,
  );
}
