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

/**
 * Parameters for creating a pledge with receipt (v1.1 trustless model)
 * Creates both a pledge cell (locked with custom pledge lock) and a receipt cell atomically.
 */
export interface CreatePledgeWithReceiptParams {
  campaignOutPoint: { txHash: string; index: number };
  campaignTypeScriptHash: string;  // hash of campaign's type script (for pledge lock args)
  deadlineBlock: bigint;           // from campaign data
  backerLockHash: string;          // backer's lock script hash
  amount: bigint;                  // pledge amount in shannons
  campaignId: string;              // campaign identifier for pledge cell data
}

/**
 * Parameters for permissionless release (anyone triggers, lock routes funds to creator)
 */
export interface PermissionlessReleaseParams {
  pledgeOutPoint: { txHash: string; index: number };
  pledgeCapacity: bigint;
  campaignCellDep: { txHash: string; index: number };
  creatorLockScript: { codeHash: string; hashType: string; args: string };
  deadlineBlock: bigint;  // for since field
}

/**
 * Parameters for permissionless refund (anyone triggers, lock routes funds to backer)
 * Receipt is not consumed — only the pledge cell is spent.
 */
export interface PermissionlessRefundParams {
  pledgeOutPoint: { txHash: string; index: number };
  pledgeCapacity: bigint;
  campaignCellDep?: { txHash: string; index: number };  // optional for fail-safe refund
  backerLockScript: { codeHash: string; hashType: string; args: string };
  deadlineBlock: bigint;
}

/**
 * Parameters for merging N pledge cells into 1 (same backer, same campaign)
 */
export interface MergeContributionsParams {
  pledgeOutPoints: Array<{ txHash: string; index: number }>;  // N >= 2
  pledgeCapacities: bigint[];  // capacity of each input pledge cell
  campaignId: string;
  backerLockHash: string;
  pledgeLockArgs: string;  // full 72-byte hex args for the pledge lock
  totalAmount: bigint;     // sum of all pledge amounts for output data
}
