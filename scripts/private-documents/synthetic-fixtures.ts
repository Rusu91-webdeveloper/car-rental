const MARKER = "TEST FILE - NOT A REAL IDENTITY DOCUMENT";

export interface SyntheticDocumentFixture {
  key: "PDF" | "JPEG" | "PNG";
  fileName: string;
  extension: ".pdf" | ".jpg" | ".png";
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  bytes: Uint8Array;
}

function pdfFixture() {
  return new TextEncoder().encode(
    `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 0 >>\nendobj\n% ${MARKER}\n%%EOF`,
  );
}

function jpegFixture() {
  const base = Uint8Array.from(
    Buffer.from(
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=",
      "base64",
    ),
  );
  const comment = new TextEncoder().encode(MARKER);
  const segment = new Uint8Array(comment.length + 4);
  segment.set([
    0xff,
    0xfe,
    (comment.length + 2) >> 8,
    (comment.length + 2) & 0xff,
  ]);
  segment.set(comment, 4);
  const result = new Uint8Array(base.length + segment.length);
  result.set(base.slice(0, 2));
  result.set(segment, 2);
  result.set(base.slice(2), segment.length + 2);
  return result;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngTextChunk() {
  const type = new TextEncoder().encode("tEXt");
  const data = new TextEncoder().encode(`Notice\0${MARKER}`);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(type, 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.slice(4, 8 + data.length)));
  return chunk;
}

function pngFixture() {
  const base = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const marker = pngTextChunk();
  const iendOffset = base.length - 12;
  const result = new Uint8Array(base.length + marker.length);
  result.set(base.slice(0, iendOffset));
  result.set(marker, iendOffset);
  result.set(base.slice(iendOffset), iendOffset + marker.length);
  return result;
}

export function syntheticDocumentFixtures(): SyntheticDocumentFixture[] {
  return [
    {
      key: "PDF",
      fileName: "test-file-not-real-identity.pdf",
      extension: ".pdf",
      mimeType: "application/pdf",
      bytes: pdfFixture(),
    },
    {
      key: "JPEG",
      fileName: "test-file-not-real-identity.jpg",
      extension: ".jpg",
      mimeType: "image/jpeg",
      bytes: jpegFixture(),
    },
    {
      key: "PNG",
      fileName: "test-file-not-real-identity.png",
      extension: ".png",
      mimeType: "image/png",
      bytes: pngFixture(),
    },
  ];
}

export const SYNTHETIC_MARKER = MARKER;
