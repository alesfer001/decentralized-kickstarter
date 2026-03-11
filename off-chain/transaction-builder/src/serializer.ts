import { CampaignParams, CampaignStatus, PledgeParams } from "./types";

/**
 * Convert u64 bigint to little-endian hex string (16 chars)
 */
export function u64ToHexLE(value: bigint): string {
  const hex = value.toString(16).padStart(16, "0");

  // Reverse byte order for little-endian
  let reversed = "";
  for (let i = hex.length - 2; i >= 0; i -= 2) {
    reversed += hex.slice(i, i + 2);
  }

  return reversed;
}

/**
 * Convert u16 to little-endian hex string (4 chars)
 */
function u16ToHexLE(value: number): string {
  const hex = value.toString(16).padStart(4, "0");
  return hex.slice(2, 4) + hex.slice(0, 2);
}

/**
 * Serialize campaign metadata (title + description) to hex string.
 * Layout: title_len (u16 LE) + title (UTF-8) + description_len (u16 LE) + description (UTF-8)
 */
export function serializeMetadata(title?: string, description?: string): string {
  const titleBytes = new TextEncoder().encode(title || "");
  const descBytes = new TextEncoder().encode(description || "");

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

/**
 * Get the total byte size of serialized metadata
 */
export function getMetadataSize(title?: string, description?: string): number {
  const titleLen = new TextEncoder().encode(title || "").length;
  const descLen = new TextEncoder().encode(description || "").length;
  return 2 + titleLen + 2 + descLen; // u16 + title + u16 + description
}

/**
 * Serialize campaign data to bytes for creating campaign cell
 * Layout (65 bytes header + variable metadata):
 * - creator_lock_hash: [u8; 32]  (bytes 0-31)
 * - funding_goal: u64            (bytes 32-39)
 * - deadline_block: u64          (bytes 40-47)
 * - total_pledged: u64           (bytes 48-55)
 * - status: u8                   (byte 56)
 * - reserved: [u8; 8]            (bytes 57-64)
 * - metadata (optional):
 *   - title_len: u16 LE          + title: [u8; title_len]
 *   - description_len: u16 LE    + description: [u8; description_len]
 */
export function serializeCampaignData(params: CampaignParams): string {
  const creatorHash = params.creatorLockHash.startsWith("0x")
    ? params.creatorLockHash.slice(2)
    : params.creatorLockHash;

  const fundingGoal = u64ToHexLE(params.fundingGoal);
  const deadlineBlock = u64ToHexLE(params.deadlineBlock);
  const totalPledged = u64ToHexLE(BigInt(0)); // New campaign starts with 0 pledged
  const status = CampaignStatus.Active.toString(16).padStart(2, "0"); // Active = 0
  const reserved = "00".repeat(8);

  let hex = creatorHash + fundingGoal + deadlineBlock + totalPledged + status + reserved;

  // Append metadata if provided
  if (params.title || params.description) {
    hex += serializeMetadata(params.title, params.description);
  }

  return "0x" + hex;
}

/**
 * Serialize campaign data with explicit totalPledged and status values
 * Used for finalization (state transition). Preserves metadata if provided.
 */
export function serializeCampaignDataWithStatus(
  data: { creatorLockHash: string; fundingGoal: bigint; deadlineBlock: bigint; totalPledged: bigint; title?: string; description?: string },
  status: CampaignStatus
): string {
  const creatorHash = data.creatorLockHash.startsWith("0x")
    ? data.creatorLockHash.slice(2)
    : data.creatorLockHash;

  const fundingGoal = u64ToHexLE(data.fundingGoal);
  const deadlineBlock = u64ToHexLE(data.deadlineBlock);
  const totalPledged = u64ToHexLE(data.totalPledged);
  const statusHex = status.toString(16).padStart(2, "0");
  const reserved = "00".repeat(8);

  let hex = creatorHash + fundingGoal + deadlineBlock + totalPledged + statusHex + reserved;

  // Preserve metadata during finalization
  if (data.title || data.description) {
    hex += serializeMetadata(data.title, data.description);
  }

  return "0x" + hex;
}

/**
 * Serialize pledge data to bytes for creating pledge cell
 * Layout (72 bytes):
 * - campaign_id: [u8; 32]        (bytes 0-31)
 * - backer_lock_hash: [u8; 32]   (bytes 32-63)
 * - amount: u64                  (bytes 64-71)
 */
export function serializePledgeData(params: PledgeParams): string {
  const campaignId = params.campaignId.startsWith("0x") ? params.campaignId.slice(2) : params.campaignId;
  const backerHash = params.backerLockHash.startsWith("0x")
    ? params.backerLockHash.slice(2)
    : params.backerLockHash;
  const amount = u64ToHexLE(params.amount);

  return "0x" + campaignId + backerHash + amount;
}

/**
 * Calculate required capacity for a cell
 * CKB formula: capacity >= sum(capacity, data, type, lock)
 */
export function calculateCellCapacity(dataSize: number, hasTypeScript: boolean, lockScriptSize: number): bigint {
  // Base: 8 bytes for capacity field itself
  const baseCapacity = 8;

  // Data: size of the data field
  const dataCapacity = dataSize;

  // Type script: ~65 bytes if present (code_hash + hash_type + args)
  const typeCapacity = hasTypeScript ? 65 : 0;

  // Lock script: usually ~65 bytes (code_hash + hash_type + args)
  const lockCapacity = lockScriptSize || 65;

  // Total in bytes, then convert to shannons (1 byte = 1 CKB = 10^8 shannons)
  const totalBytes = baseCapacity + dataCapacity + typeCapacity + lockCapacity;

  // Add 20% buffer for safety
  const withBuffer = Math.ceil(totalBytes * 1.2);

  // Convert to shannons (1 byte of capacity = 1 shannon, minimum is 61 CKB)
  return BigInt(Math.max(withBuffer, 61)) * BigInt(100000000);
}
