import { ccc } from "@ckb-ccc/core";
import { Campaign, Pledge, CampaignStatus } from "./types";
import { parseCampaignData, parsePledgeData } from "./parser";
import { Database, DBCampaign, DBPledge } from "./database";

/**
 * Indexer for Campaign and Pledge cells
 * Uses SQLite for persistence and background polling for updates.
 */
export class CampaignIndexer {
  private client: ccc.Client;
  private db: Database;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private campaignCodeHash: string = "";
  private pledgeCodeHash: string = "";

  constructor(rpcUrl: string, db: Database) {
    this.client = new ccc.ClientPublicTestnet({ url: rpcUrl });
    this.db = db;
  }

  /**
   * Get client instance
   */
  getClient(): ccc.Client {
    return this.client;
  }

  /**
   * Get block number for a transaction
   */
  private async getBlockNumberForTx(txHash: string): Promise<bigint> {
    try {
      const tx = await this.client.getTransaction(txHash);
      if (tx && tx.blockNumber !== undefined && tx.blockNumber !== null) {
        return BigInt(tx.blockNumber);
      }
    } catch (error) {
      console.error(`Failed to get block number for tx ${txHash}:`, error);
    }
    return BigInt(0);
  }

  /**
   * Look up the original campaign txHash for a finalized campaign.
   */
  private async getOriginalTxHash(finalizationTxHash: string): Promise<string | undefined> {
    try {
      const txWithStatus = await this.client.getTransaction(finalizationTxHash);
      if (!txWithStatus || !txWithStatus.transaction) return undefined;

      const tx = txWithStatus.transaction;
      if (tx.inputs.length > 0) {
        const firstInput = tx.inputs[0];
        return firstInput.previousOutput?.txHash;
      }
    } catch (error) {
      console.error(`Failed to look up original txHash for ${finalizationTxHash}:`, error);
    }
    return undefined;
  }

  /**
   * Index all cells from RPC and write to database
   */
  async indexAll(campaignCodeHash: string, pledgeCodeHash: string): Promise<{ campaigns: number; pledges: number }> {
    console.log("Indexing all cells...");

    // Fetch campaigns from RPC
    const campaignSearchKey = {
      script: {
        codeHash: campaignCodeHash,
        hashType: "data2" as const,
        args: "0x",
      },
      scriptType: "type" as const,
      scriptSearchMode: "exact" as const,
    };

    const campaignCells: ccc.Cell[] = [];
    for await (const cell of this.client.findCells(campaignSearchKey, "asc", 1000)) {
      campaignCells.push(cell);
    }

    // Fetch pledges from RPC
    const pledgeSearchKey = {
      script: {
        codeHash: pledgeCodeHash,
        hashType: "data2" as const,
        args: "0x",
      },
      scriptType: "type" as const,
      scriptSearchMode: "exact" as const,
    };

    const pledgeCells: ccc.Cell[] = [];
    for await (const cell of this.client.findCells(pledgeSearchKey, "asc", 1000)) {
      pledgeCells.push(cell);
    }

    // Parse campaigns
    const dbCampaigns: DBCampaign[] = [];
    for (const cell of campaignCells) {
      try {
        const outPointStr = `${cell.outPoint.txHash}_${cell.outPoint.index}`;
        const data = parseCampaignData(cell.outputData);
        const blockNumber = await this.getBlockNumberForTx(cell.outPoint.txHash);

        let originalTxHash: string | undefined;
        if (data.status !== CampaignStatus.Active) {
          originalTxHash = await this.getOriginalTxHash(cell.outPoint.txHash);
        }

        // Extract creator lock script from the cell's own lock (creator owns the campaign cell)
        const lockScript = cell.cellOutput.lock;

        dbCampaigns.push({
          id: outPointStr,
          tx_hash: cell.outPoint.txHash,
          output_index: Number(cell.outPoint.index),
          creator_lock_hash: data.creatorLockHash,
          creator_lock_code_hash: lockScript?.codeHash || null,
          creator_lock_hash_type: lockScript?.hashType || null,
          creator_lock_args: lockScript?.args || null,
          funding_goal: data.fundingGoal.toString(),
          deadline_block: data.deadlineBlock.toString(),
          total_pledged: data.totalPledged.toString(),
          status: data.status,
          title: data.title || null,
          description: data.description || null,
          created_at: blockNumber.toString(),
          original_tx_hash: originalTxHash || null,
        });
      } catch (error) {
        console.error("Error parsing campaign cell:", error);
      }
    }

    // Parse pledges
    const dbPledges: DBPledge[] = [];
    for (const cell of pledgeCells) {
      try {
        const outPointStr = `${cell.outPoint.txHash}_${cell.outPoint.index}`;
        const data = parsePledgeData(cell.outputData);
        const blockNumber = await this.getBlockNumberForTx(cell.outPoint.txHash);

        dbPledges.push({
          id: outPointStr,
          tx_hash: cell.outPoint.txHash,
          output_index: Number(cell.outPoint.index),
          campaign_id: data.campaignId,
          backer_lock_hash: data.backerLockHash,
          amount: data.amount.toString(),
          created_at: blockNumber.toString(),
        });
      } catch (error) {
        console.error("Error parsing pledge cell:", error);
      }
    }

    // Atomically replace all data in DB
    this.db.replaceLiveCells(dbCampaigns, dbPledges);

    console.log(`Indexed ${dbCampaigns.length} campaigns and ${dbPledges.length} pledges`);
    return { campaigns: dbCampaigns.length, pledges: dbPledges.length };
  }

  /**
   * Start background polling
   */
  startBackgroundIndexing(campaignCodeHash: string, pledgeCodeHash: string, intervalMs: number = 10000) {
    this.campaignCodeHash = campaignCodeHash;
    this.pledgeCodeHash = pledgeCodeHash;

    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }

    this.pollingTimer = setInterval(async () => {
      try {
        await this.indexAll(this.campaignCodeHash, this.pledgeCodeHash);
      } catch (error) {
        console.error("Background indexing error:", error);
      }
    }, intervalMs);

    console.log(`Background indexing started (every ${intervalMs / 1000}s)`);
  }

  /**
   * Stop background polling
   */
  stopBackgroundIndexing() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
      console.log("Background indexing stopped");
    }
  }

  /**
   * Get the txHash to use for pledge matching.
   * For finalized campaigns, pledges reference the original creation txHash.
   */
  private getPledgeLinkageTxHash(campaign: Campaign): string {
    return campaign.originalTxHash || campaign.txHash;
  }

  /**
   * Convert DB row to Campaign domain object
   */
  private dbToCampaign(row: DBCampaign): Campaign {
    return {
      id: row.id,
      txHash: row.tx_hash,
      index: row.output_index,
      creatorLockHash: row.creator_lock_hash,
      fundingGoal: BigInt(row.funding_goal),
      deadlineBlock: BigInt(row.deadline_block),
      totalPledged: BigInt(row.total_pledged),
      status: row.status as CampaignStatus,
      title: row.title || undefined,
      description: row.description || undefined,
      createdAt: BigInt(row.created_at),
      originalTxHash: row.original_tx_hash || undefined,
      creatorLockScript: row.creator_lock_code_hash
        ? {
            codeHash: row.creator_lock_code_hash,
            hashType: row.creator_lock_hash_type!,
            args: row.creator_lock_args!,
          }
        : undefined,
    };
  }

  /**
   * Convert DB row to Pledge domain object
   */
  private dbToPledge(row: DBPledge): Pledge {
    return {
      id: row.id,
      txHash: row.tx_hash,
      index: row.output_index,
      campaignId: row.campaign_id,
      backerLockHash: row.backer_lock_hash,
      amount: BigInt(row.amount),
      createdAt: BigInt(row.created_at),
    };
  }

  /**
   * Calculate total pledged for a campaign by summing all pledges
   */
  calculateTotalPledged(campaign: Campaign): bigint {
    const linkageHash = this.getPledgeLinkageTxHash(campaign).toLowerCase();
    const pledges = this.db.getAllPledges();
    let total = BigInt(0);
    for (const p of pledges) {
      if (p.campaign_id.toLowerCase() === linkageHash) {
        total += BigInt(p.amount);
      }
    }
    return total;
  }

  /**
   * Get all campaigns
   */
  getCampaigns(): Campaign[] {
    return this.db.getAllCampaigns().map((row) => this.dbToCampaign(row));
  }

  /**
   * Get campaign by ID
   */
  getCampaign(id: string): Campaign | undefined {
    const row = this.db.getCampaign(id);
    return row ? this.dbToCampaign(row) : undefined;
  }

  /**
   * Get pledges for a campaign
   */
  getPledgesForCampaign(campaignId: string): Pledge[] {
    const campaign = this.getCampaign(campaignId);
    if (campaign) {
      const linkageHash = this.getPledgeLinkageTxHash(campaign).toLowerCase();
      return this.db.getAllPledges()
        .filter((p) => p.campaign_id.toLowerCase() === linkageHash)
        .map((row) => this.dbToPledge(row));
    }

    // Fallback: extract txHash from campaignId and match directly
    const campaignTxHash = campaignId.includes("_") ? campaignId.split("_")[0] : campaignId;
    const normalizedHash = campaignTxHash.toLowerCase();
    return this.db.getAllPledges()
      .filter((p) => p.campaign_id.toLowerCase() === normalizedHash)
      .map((row) => this.dbToPledge(row));
  }

  /**
   * Get pledges for a specific backer (by lock hash)
   */
  getPledgesForBacker(backerLockHash: string): Pledge[] {
    return this.db.getPledgesForBacker(backerLockHash).map((row) => this.dbToPledge(row));
  }

  /**
   * Get all pledges
   */
  getPledges(): Pledge[] {
    return this.db.getAllPledges().map((row) => this.dbToPledge(row));
  }

  /**
   * Get current block number
   */
  async getCurrentBlockNumber(): Promise<bigint> {
    const tip = await this.client.getTip();
    return BigInt(tip);
  }
}
