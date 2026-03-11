/**
 * Campaign data structure matching the on-chain layout
 */
export interface CampaignData {
  creatorLockHash: string; // 32 bytes hex
  fundingGoal: bigint;
  deadlineBlock: bigint;
  totalPledged: bigint;
  status: CampaignStatus;
  title?: string; // Variable-length metadata appended after the 65-byte header
  description?: string;
}

export enum CampaignStatus {
  Active = 0,
  Success = 1,
  Failed = 2,
}

/**
 * Pledge data structure matching the on-chain layout
 */
export interface PledgeData {
  campaignId: string; // 32 bytes hex
  backerLockHash: string; // 32 bytes hex
  amount: bigint;
}

/**
 * Campaign with metadata
 */
export interface Campaign extends CampaignData {
  id: string; // cell out_point
  txHash: string;
  index: number;
  createdAt: bigint; // block number
  originalTxHash?: string; // For finalized campaigns: the original creation txHash (used for pledge linkage)
}

/**
 * Pledge with metadata
 */
export interface Pledge extends PledgeData {
  id: string; // cell out_point
  txHash: string;
  index: number;
  createdAt: bigint; // block number
}

/**
 * Parsed campaign data from cell
 */
export interface CampaignCell {
  outPoint: {
    txHash: string;
    index: string;
  };
  data: CampaignData;
  capacity: bigint;
  blockNumber: bigint;
}

/**
 * Parsed pledge data from cell
 */
export interface PledgeCell {
  outPoint: {
    txHash: string;
    index: string;
  };
  data: PledgeData;
  capacity: bigint;
  blockNumber: bigint;
}
