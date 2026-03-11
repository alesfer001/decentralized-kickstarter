/**
 * Shared serialization helpers for campaign/pledge data encoding.
 * Used by both campaign creation and finalization flows.
 */

/** Convert a u64 (bigint) to little-endian hex string (16 chars) */
export function u64ToHexLE(value: bigint): string {
  const hex = value.toString(16).padStart(16, "0");
  let reversed = "";
  for (let i = hex.length - 2; i >= 0; i -= 2) {
    reversed += hex.slice(i, i + 2);
  }
  return reversed;
}

/** Convert a u16 (number) to little-endian hex string (4 chars) */
export function u16ToHexLE(value: number): string {
  const hex = value.toString(16).padStart(4, "0");
  return hex.slice(2, 4) + hex.slice(0, 2);
}

/** Serialize metadata (title + description) to hex string */
export function serializeMetadataHex(title: string, description: string): string {
  const titleBytes = new TextEncoder().encode(title);
  const descBytes = new TextEncoder().encode(description);

  let hex = u16ToHexLE(titleBytes.length);
  for (const b of titleBytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  hex += u16ToHexLE(descBytes.length);
  for (const b of descBytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}
