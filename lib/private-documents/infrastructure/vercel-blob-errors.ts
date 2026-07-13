import {
  BlobAccessError,
  BlobContentTypeNotAllowedError,
  BlobFileTooLargeError,
  BlobNotFoundError,
  BlobPathnameMismatchError,
  BlobPreconditionFailedError,
  BlobRequestAbortedError,
  BlobServiceNotAvailable,
  BlobServiceRateLimited,
  BlobStoreNotFoundError,
} from "@vercel/blob";
import { PrivateDocumentError } from "../domain/errors";

export function mapVercelBlobError(
  error: unknown,
  operation: "grant" | "inspect" | "retrieve" | "delete" | "list",
) {
  if (error instanceof PrivateDocumentError) return error;
  if (error instanceof BlobAccessError)
    return new PrivateDocumentError(
      "DOCUMENT_PROVIDER_AUTH_UNAVAILABLE",
      "Private object provider authentication is unavailable.",
    );
  if (error instanceof BlobStoreNotFoundError)
    return new PrivateDocumentError(
      "DOCUMENT_PROVIDER_STORE_UNAVAILABLE",
      "Private object store is unavailable.",
    );
  if (error instanceof BlobPathnameMismatchError)
    return new PrivateDocumentError(
      "DOCUMENT_PATHNAME_INVALID",
      "Private object pathname was rejected.",
    );
  if (error instanceof BlobNotFoundError)
    return new PrivateDocumentError(
      "DOCUMENT_UPLOAD_NOT_FOUND",
      "Private object was not found.",
    );
  if (error instanceof BlobPreconditionFailedError)
    return new PrivateDocumentError(
      "DOCUMENT_UPLOAD_METADATA_MISMATCH",
      "Private object version no longer matches.",
    );
  if (error instanceof BlobFileTooLargeError)
    return new PrivateDocumentError(
      "DOCUMENT_FILE_TOO_LARGE",
      "Private object exceeds the approved size.",
    );
  if (error instanceof BlobContentTypeNotAllowedError)
    return new PrivateDocumentError(
      "DOCUMENT_MIME_UNSUPPORTED",
      "Private object content type is not allowed.",
    );
  if (error instanceof BlobServiceRateLimited)
    return new PrivateDocumentError(
      "DOCUMENT_PROVIDER_THROTTLED",
      "Private object provider is temporarily throttled.",
      true,
    );
  if (error instanceof BlobServiceNotAvailable)
    return new PrivateDocumentError(
      "DOCUMENT_PROVIDER_STORE_UNAVAILABLE",
      "Private object provider is temporarily unavailable.",
      true,
    );
  if (error instanceof BlobRequestAbortedError)
    return new PrivateDocumentError(
      "DOCUMENT_PROVIDER_TIMEOUT",
      "Private object provider request did not complete.",
      true,
    );
  return new PrivateDocumentError(
    "DOCUMENT_PROVIDER_OPERATION_FAILED",
    `Private object ${operation} operation failed.`,
  );
}
