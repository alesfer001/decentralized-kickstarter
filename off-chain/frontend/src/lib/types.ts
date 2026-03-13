/**
 * Campaign data from the indexer API
 */
export interface CreatorLockScript {
  codeHash: string;
  hashType: string;
  args: string;
}

export interface Campaign {
  campaignId: string;
  creator: string;
  creatorLockScript?: CreatorLockScript | null;
  title?: string;
  description?: string;
  fundingGoal: string;
  deadlineBlock: string;
  totalPledged: string;
  status: CampaignStatus;
  effectiveStatus?: string;
  txHash: string;
  index: number;
  createdAt: string;
}

export enum CampaignStatus {
  Active = 0,
  Success = 1,
  Failed = 2,
}

/**
 * Pledge data from the indexer API
 */
export interface Pledge {
  pledgeId: string;
  campaignId: string;
  backer: string;
  amount: string;
  txHash: string;
  index: number;
  createdAt: string;
}

/**
 * Form data for creating a campaign
 */
export interface CreateCampaignForm {
  title: string;
  description: string;
  fundingGoalCKB: number;
  deadlineBlocks: number;
}

/**
 * Form data for creating a pledge
 */
export interface CreatePledgeForm {
  amountCKB: number;
}
