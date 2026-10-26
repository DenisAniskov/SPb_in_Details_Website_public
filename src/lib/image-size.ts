/**
 * Intrinsic size of a PNG, JPEG or WebP image, read from the file header.
 *
 * The showcase needs it twice: to publish real `width`/`height` attributes
 * (no layout shift) and to reject a file that cannot be a phone screenshot.
 * Only the header is parsed — the pixel data is never decoded, so this stays
 * cheap and works offline.
 */

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function be32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  );
}

function le16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function be16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readPng(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 24) return null;
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) return null;
  }
  // IHDR is the first chunk: length(4) type(4) width(4) height(4).
  const isIhdr =
    bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52;
  if (!isIhdr) return null;
  const width = be32(bytes, 16);
  const height = be32(bytes, 20);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** Start-of-frame markers carry the JPEG dimensions; other segments do not. */
function isStartOfFrame(marker: number): boolean {
  if (marker >= 0xc0 && marker <= 0xc3) return true;
  if (marker >= 0xc5 && marker <= 0xc7) return true;
  if (marker >= 0xc9 && marker <= 0xcb) return true;
  return marker >= 0xcd && marker <= 0xcf;
}

function readJpeg(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    let marker = bytes[offset + 1] ?? 0;
    // Fill bytes: any number of 0xFF may precede the marker code.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    offset += 2;
    // Standalone markers carry no payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 1 >= bytes.length) return null;
    const segmentLength = be16(bytes, offset);
    if (segmentLength < 2) return null;
    if (isStartOfFrame(marker)) {
      if (offset + 6 >= bytes.length) return null;
      const height = be16(bytes, offset + 3);
      const width = be16(bytes, offset + 5);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += segmentLength;
  }
  return null;
}

function readWebp(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 30) return null;
  const riff =
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const webp =
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (!riff || !webp) return null;

  const fourcc = String.fromCharCode(
    bytes[12] ?? 0,
    bytes[13] ?? 0,
    bytes[14] ?? 0,
    bytes[15] ?? 0,
  );

  if (fourcc === 'VP8 ') {
    // Lossy: start code 0x9d 0x01 0x2a, then 14-bit width and height.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    const width = le16(bytes, 26) & 0x3fff;
    const height = le16(bytes, 28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (fourcc === 'VP8L') {
    // Lossless: signature 0x2f, then width-1 and height-1 as 14-bit fields.
    if (bytes[20] !== 0x2f) return null;
    const bits =
      ((bytes[21] ?? 0) | ((bytes[22] ?? 0) << 8) | ((bytes[23] ?? 0) << 16) | ((bytes[24] ?? 0) << 24)) >>> 0;
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    return { width, height };
  }

  if (fourcc === 'VP8X') {
    // Extended: 24-bit canvas size minus one, after flags and reserved bytes.
    const width = ((bytes[24] ?? 0) | ((bytes[25] ?? 0) << 8) | ((bytes[26] ?? 0) << 16)) + 1;
    const height = ((bytes[27] ?? 0) | ((bytes[28] ?? 0) << 8) | ((bytes[29] ?? 0) << 16)) + 1;
    return { width, height };
  }

  return null;
}

/**
 * Returns the intrinsic size, or `null` when the bytes are not a readable
 * PNG, JPEG or WebP image — which is exactly the condition the showcase treats
 * as "this file must not be published as a screenshot".
 */
export function readImageSize(bytes: Uint8Array): ImageSize | null {
  return readPng(bytes) ?? readJpeg(bytes) ?? readWebp(bytes);
}
