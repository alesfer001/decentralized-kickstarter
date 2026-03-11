/**
 * Campaign data for creating a campaign cell
 */
export interface CampaignParams {
  creatorLockHash: string; // 32 bytes hex
  fundingGoal: bigint; // in CKB shannons
  deadlineBlock: bigint;
  title?: string; // Campaign title (stored as variable-length metadata after the 65-byte header)
  description?: string; // Campaign description
}

/**
 * Pledge data for creating a pledge cell
 */
export interface PledgeParams {
  campaignId: string; // 32 bytes hex (hash of campaign cell)
  backerLockHash: string; // 32 bytes hex
  amount: bigint; // in CKB shannons
}

/**
 * Campaign status enum (matches on-chain)
 */
export enum CampaignStatus {
  Active = 0,
  Success = 1,
  Failed = 2,
}

/**
 * Transaction building result
 */
export interface TxResult {
  txHash: string;
  tx: any; // ccc.Transaction
}

/**
 * Deployed contract info
 */
export interface ContractInfo {
  codeHash: string;
  hashType: "type" | "data" | "data1" | "data2";
  txHash: string;
  index: number;
}

/**
 * Parameters for finalizing a campaign (Active -> Success/Failed)
 */
export interface FinalizeCampaignParams {
  campaignOutPoint: { txHash: string; index: number };
  campaignData: {
    creatorLockHash: string;
    fundingGoal: bigint;
    deadlineBlock: bigint;
    totalPledged: bigint;
    title?: string;
    description?: string;
  };
  newStatus: CampaignStatus.Success | CampaignStatus.Failed;
}

/**
 * Parameters for refunding a pledge (backer reclaims CKB)
 */
export interface RefundPledgeParams {
  pledgeOutPoint: { txHash: string; index: number };
  pledgeCapacity: bigint;
}

/**
 * Parameters for releasing a pledge to the campaign creator
 */
export interface ReleasePledgeParams {
  pledgeOutPoint: { txHash: string; index: number };
  pledgeCapacity: bigint;
  creatorAddress: string;
}

/**
 * Parameters for destroying a finalized campaign (reclaim CKB capacity)
 */
export interface DestroyCampaignParams {
  campaignOutPoint: { txHash: string; index: number };
  campaignCapacity: bigint;
}
