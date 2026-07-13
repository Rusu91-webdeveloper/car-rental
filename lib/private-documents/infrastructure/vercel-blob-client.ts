import {
  BlobNotFoundError,
  del,
  get,
  head,
  issueSignedToken,
  list,
  presignUrl,
} from "@vercel/blob";

export interface VercelBlobHead {
  size: number;
  uploadedAt: Date;
  pathname: string;
  contentType: string;
  etag: string;
}

export interface VercelBlobGet {
  statusCode: 200;
  stream: ReadableStream<Uint8Array>;
  blob: VercelBlobHead;
}

export interface VercelBlobListResult {
  blobs: Array<
    Pick<VercelBlobHead, "size" | "uploadedAt" | "pathname" | "etag">
  >;
  cursor?: string;
  hasMore: boolean;
}

export interface VercelBlobClient {
  issueUploadToken(input: {
    pathname: string;
    validUntil: number;
    allowedContentTypes: string[];
    maximumSizeInBytes: number;
  }): Promise<unknown>;
  presignPut(
    token: unknown,
    input: {
      pathname: string;
      validUntil: number;
      allowedContentTypes: string[];
      maximumSizeInBytes: number;
      allowOverwrite: false;
      addRandomSuffix: false;
      cacheControlMaxAge: number;
    },
  ): Promise<{ presignedUrl: string }>;
  head(pathname: string): Promise<VercelBlobHead | undefined>;
  get(
    pathname: string,
    input: { useCache: boolean },
  ): Promise<VercelBlobGet | undefined>;
  delete(pathname: string, input: { ifMatch?: string }): Promise<void>;
  list(input: {
    prefix: string;
    limit: number;
    cursor?: string;
  }): Promise<VercelBlobListResult>;
}

export function isVercelBlobNotFound(error: unknown) {
  return error instanceof BlobNotFoundError;
}

export const vercelBlobClient: VercelBlobClient = {
  issueUploadToken: (input) =>
    issueSignedToken({
      pathname: input.pathname,
      operations: ["put"],
      validUntil: input.validUntil,
      allowedContentTypes: input.allowedContentTypes,
      maximumSizeInBytes: input.maximumSizeInBytes,
    }),
  presignPut: (token, input) =>
    presignUrl(token as Parameters<typeof presignUrl>[0], {
      access: "private",
      operation: "put",
      ...input,
    }),
  async head(pathname) {
    try {
      return await head(pathname);
    } catch (error) {
      if (isVercelBlobNotFound(error)) return undefined;
      throw error;
    }
  },
  async get(pathname, input) {
    const result = await get(pathname, {
      access: "private",
      useCache: input.useCache,
    });
    if (!result) return undefined;
    if (result.statusCode !== 200)
      throw new Error("Unexpected conditional Blob response.");
    return {
      statusCode: 200,
      stream: result.stream,
      blob: {
        size: result.blob.size,
        uploadedAt: result.blob.uploadedAt,
        pathname: result.blob.pathname,
        contentType: result.blob.contentType,
        etag: result.blob.etag,
      },
    };
  },
  delete: (pathname, input) => del(pathname, input),
  list,
};
