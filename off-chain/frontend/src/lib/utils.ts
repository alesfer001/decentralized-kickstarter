import { CampaignStatus, Pledge, PledgeDistributionStatus } from "./types";

/**
 * Convert shannons to CKB (1 CKB = 10^8 shannons)
 */
export function shannonsToCKB(shannons: string | bigint): string {
  const value = typeof shannons === "string" ? BigInt(shannons) : shannons;
  const ckb = Number(value) / 100_000_000;
  return ckb.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Convert CKB to shannons
 */
export function ckbToShannons(ckb: number): bigint {
  return BigInt(Math.floor(ckb * 100_000_000));
}

/**
 * Format a lock hash for display (truncate middle)
 */
export function formatHash(hash: string, chars: number = 8): string {
  if (hash.length <= chars * 2 + 2) return hash;
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`;
}

/**
 * Get status label
 */
export function getStatusLabel(status: CampaignStatus): string {
  switch (status) {
    case CampaignStatus.Active:
      return "Active";
    case CampaignStatus.Success:
      return "Funded";
    case CampaignStatus.Failed:
      return "Failed";
    default:
      return "Unknown";
  }
}

/**
 * Get status color class
 */
export function getStatusColor(status: CampaignStatus): string {
  switch (status) {
    case CampaignStatus.Active:
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case CampaignStatus.Success:
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case CampaignStatus.Failed:
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
  }
}

/**
 * Calculate funding progress percentage
 */
export function getFundingProgress(totalPledged: string, fundingGoal: string): number {
  const pledged = BigInt(totalPledged);
  const goal = BigInt(fundingGoal);
  if (goal === BigInt(0)) return 0;
  return Number((pledged * BigInt(100)) / goal);
}

/**
 * Get display label for effective campaign status
 */
export function getEffectiveStatusLabel(effectiveStatus: string): string {
  switch (effectiveStatus) {
    case "active":
      return "Active";
    case "expired_success":
      return "Expired - Funded";
    case "expired_failed":
      return "Expired - Needs Finalization";
    case "success":
      return "Funded";
    case "failed":
      return "Failed";
    default:
      return "Unknown";
  }
}

/**
 * Get Tailwind badge classes for effective campaign status
 */
export function getEffectiveStatusColor(effectiveStatus: string): string {
  switch (effectiveStatus) {
    case "active":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "expired_success":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "expired_failed":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
    case "success":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "failed":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
  }
}

/**
 * Convert remaining blocks to a human-readable time estimate (~10s/block)
 */
export function blocksToTimeEstimate(blocksRemaining: bigint): string {
  if (blocksRemaining <= 0n) return "Expired";
  const totalSeconds = Number(blocksRemaining) * 10;
  if (totalSeconds < 60) return `~${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `~${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `~${hours}h`;
  const days = Math.floor(hours / 24);
  return `~${days} day${days !== 1 ? "s" : ""}`;
}

/**
 * Convert a block number to a relative time string like "~2 hours ago"
 */
export function blockToRelativeTime(blockNumber: string, currentBlock: bigint): string {
  const block = BigInt(blockNumber);
  const diff = currentBlock - block;
  if (diff <= 0n) return "just now";
  const totalSeconds = Number(diff) * 10;
  if (totalSeconds < 60) return `~${totalSeconds}s ago`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `~${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `~${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `~${days} day${days !== 1 ? "s" : ""} ago`;
}

/**
 * Count unique backers from a list of pledges
 */
export function getUniqueBackerCount(pledges: Pledge[]): number {
  const unique = new Set(pledges.map((p) => p.backer.toLowerCase()));
  return unique.size;
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

/**
 * Get display label for pledge distribution status (v1.1)
 */
export function getPledgeDistributionLabel(status: PledgeDistributionStatus): string {
  switch (status) {
    case "locked":
      return "Locked";
    case "releasing":
      return "Releasing...";
    case "released":
      return "Released";
    case "refunded":
      return "Refunded";
    default:
      return "Unknown";
  }
}

/**
 * Get Tailwind badge classes for pledge distribution status (v1.1)
 */
export function getPledgeDistributionColor(status: PledgeDistributionStatus): string {
  switch (status) {
    case "locked":
      return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    case "releasing":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    case "released":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "refunded":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
  }
}

/**
 * Build CKB Explorer transaction URL
 */
export function getExplorerTxUrl(explorerBase: string, txHash: string): string {
  if (!explorerBase) return "";
  return `${explorerBase}/transaction/${txHash}`;
}

/**
 * Compute aggregate distribution summary for a campaign
 * Returns a string like "All pledges released" or "3/5 pledges refunded"
 */
export function getDistributionSummary(
  totalPledges: number,
  releasedCount: number,
  refundedCount: number,
  campaignEffectiveStatus: string
): string {
  if (campaignEffectiveStatus === "active") return "Pledges locked until deadline";
  if (totalPledges === 0) return "No pledges";

  const handledCount = releasedCount + refundedCount;
  if (handledCount === 0) return "Distribution pending";

  if (releasedCount === totalPledges) return "All pledges released to creator";
  if (refundedCount === totalPledges) return "All pledges refunded to backers";

  if (releasedCount > 0) return `${releasedCount}/${totalPledges} pledges released`;
  if (refundedCount > 0) return `${refundedCount}/${totalPledges} pledges refunded`;

  return `${handledCount}/${totalPledges} pledges distributed`;
}

/**
 * Cost breakdown for pledge creation
 * Pledge amount + pledge cell capacity + receipt cell capacity + estimated fee
 * Values returned in shannons (1 CKB = 100,000,000 shannons)
 */
export interface CostBreakdown {
  pledgeAmount: bigint;
  pledgeCellCapacity: bigint;
  receiptCellCapacity: bigint;
  estimatedFee: bigint;
  totalCost: bigint;
}

/**
 * Calculate cost breakdown for pledge creation
 * Pledge amount + pledge cell capacity + receipt cell capacity + estimated fee
 * Values returned in shannons (1 CKB = 100,000,000 shannons)
 */
export function calculateCostBreakdown(pledgeAmountCkb: number | string): CostBreakdown {
  // Convert input CKB to shannons
  const pledgeAmount = BigInt(Math.floor(Number(pledgeAmountCkb) * 100000000));

  // Constants matching transaction builder (serializer.ts calculateCellCapacity)
  // pledgeBaseCapacity = calculateCellCapacity(72, true, 65)
  // formula: max(ceil((8+72+65+65)*1.2), 61) * 1e8
  const PLEDGE_CELL_CAPACITY = BigInt(Math.max(Math.ceil((8 + 72 + 65 + 65) * 1.2), 61)) * BigInt(100000000);

  // receiptCapacity = calculateCellCapacity(40, true, 65)
  // formula: max(ceil((8+40+65+65)*1.2), 61) * 1e8
  const RECEIPT_CELL_CAPACITY = BigInt(Math.max(Math.ceil((8 + 40 + 65 + 65) * 1.2), 61)) * BigInt(100000000);

  // Estimated fee (conservative: ~1 KB transaction at 1000 shannons/KB)
  const ESTIMATED_FEE = BigInt(1000);

  const totalCost = pledgeAmount + PLEDGE_CELL_CAPACITY + RECEIPT_CELL_CAPACITY + ESTIMATED_FEE;

  return {
    pledgeAmount,
    pledgeCellCapacity: PLEDGE_CELL_CAPACITY,
    receiptCellCapacity: RECEIPT_CELL_CAPACITY,
    estimatedFee: ESTIMATED_FEE,
    totalCost,
  };
}

/**
 * Format BigInt shannon values as CKB string with 2 decimal places
 */
export function formatCost(shannons: bigint): string {
  const ckb = Number(shannons) / 100000000;
  return ckb.toFixed(2);
}
