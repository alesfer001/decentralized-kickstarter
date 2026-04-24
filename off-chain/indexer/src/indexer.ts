import { ccc } from "@ckb-ccc/core";
import { Campaign, Pledge, Receipt, CampaignStatus } from "./types";
import { parseCampaignData, parsePledgeData, parseReceiptData } from "./parser";
import { Database, DBCampaign, DBPledge, DBReceipt } from "./database";
import { FinalizationBot } from "./bot";

/**
 * Create a network-aware CKB client
 * Matches the transaction-builder's createCkbClient pattern
 */
function createCkbClient(rpcUrl: string): ccc.Client {
  const network = (process.env.CKB_NETWORK || "devnet").toLowerCase();

  // For devnet, use ClientPublicTestnet with OffCKB script overrides
  if (network === "devnet") {
    const OFFCKB_DEVNET_SCRIPTS: Record<ccc.KnownScript, ccc.ScriptInfoLike | undefined> = {
      [ccc.KnownScript.Secp256k1Blake160]: {
        codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
        hashType: "type",
        cellDeps: [
          {
            cellDep: {
              outPoint: {
                txHash: "0x75be96e1871693f030db27ddae47890a28ab180e88e36ebb3575d9f1377d3da7",
                index: 0,
              },
              depType: "depGroup",
            },
          },
        ],
      },
      [ccc.KnownScript.Secp256k1Multisig]: {
        codeHash: "0x5c5069eb0857efc65e1bca0c07df34c31663b3622fd3876c876320fc9634e2a8",
        hashType: "type",
        cellDeps: [
          {
            cellDep: {
              outPoint: {
                txHash: "0x75be96e1871693f030db27ddae47890a28ab180e88e36ebb3575d9f1377d3da7",
                index: 1,
              },
              depType: "depGroup",
            },
          },
        ],
      },
      [ccc.KnownScript.TypeId]: {
        codeHash: "0x00000000000000000000000000000000000000000000000000545950455f4944",
        hashType: "type",
        cellDeps: [],
      },
      [ccc.KnownScript.AnyoneCanPay]: {
        codeHash: "0xe09352af0066f3162287763ce4ddba9af6bfaeab198dc7ab37f8c71c9e68bb5b",
        hashType: "type",
        cellDeps: [
          {
            cellDep: {
              outPoint: {
                txHash: "0x1dbed8dcfe0f18359c65c5e9546fd15cd69de73ea0a502345be30180649c9467",
                index: 8,
              },
              depType: "code",
            },
          },
          {
            cellDep: {
              outPoint: {
                txHash: "0x1dbed8dcfe0f18359c65c5e9546fd15cd69de73ea0a502345be30180649c9467",
                index: 3,
              },
              depType: "code",
            },
          },
        ],
      },
      [ccc.KnownScript.NervosDao]: {
        codeHash: "0x82d76d1b75fe2fd9a27dfbaa65a039221a380d76c926f378d3f81cf3e7e13f2e",
        hashType: "type",
        cellDeps: [
          {
            cellDep: {
              outPoint: {
                txHash: "0x1dbed8dcfe0f18359c65c5e9546fd15cd69de73ea0a502345be30180649c9467",
                index: 2,
              },
              depType: "code",
            },
          },
        ],
      },
      [ccc.KnownScript.Secp256k1MultisigV2]: undefined,
      [ccc.KnownScript.XUdt]: undefined,
      [ccc.KnownScript.JoyId]: undefined,
      [ccc.KnownScript.COTA]: undefined,
      [ccc.KnownScript.PWLock]: undefined,
      [ccc.KnownScript.OmniLock]: undefined,
      [ccc.KnownScript.NostrLock]: undefined,
      [ccc.KnownScript.UniqueType]: undefined,
      [ccc.KnownScript.AlwaysSuccess]: undefined,
      [ccc.KnownScript.InputTypeProxyLock]: undefined,
      [ccc.KnownScript.OutputTypeProxyLock]: undefined,
      [ccc.KnownScript.LockProxyLock]: undefined,
      [ccc.KnownScript.SingleUseLock]: undefined,
      [ccc.KnownScript.TypeBurnLock]: undefined,
      [ccc.KnownScript.EasyToDiscoverType]: undefined,
      [ccc.KnownScript.TimeLock]: undefined,
    };
    return new ccc.ClientPublicTestnet({
      url: rpcUrl,
      scripts: OFFCKB_DEVNET_SCRIPTS,
      fallbacks: [],
    });
  } else if (network === "testnet") {
    return new ccc.ClientPublicTestnet({ url: rpcUrl });
  } else if (network === "mainnet") {
    return new ccc.ClientPublicMainnet({ url: rpcUrl });
  } else {
    // Default to testnet for unknown networks
    return new ccc.ClientPublicTestnet({ url: rpcUrl });
  }
}

/**
 * Indexer for Campaign and Pledge cells
 * Uses SQLite for persistence and background polling for updates.
 */
export class CampaignIndexer {
  private client: ccc.Client;
  private rpcUrl: string;
  private db: Database;
  private bot: FinalizationBot | null = null;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private campaignCodeHash: string = "";
  private pledgeCodeHash: string = "";
  private receiptCodeHash: string = "";
  private pledgeLockCodeHash: string = "";

  constructor(rpcUrl: string, db: Database) {
    this.client = createCkbClient(rpcUrl);
    this.rpcUrl = rpcUrl;
    this.db = db;
  }

  /**
   * Get client instance
   */
  getClient(): ccc.Client {
    return this.client;
  }

  /**
   * Inject bot instance into indexer
   */
  setBot(bot: FinalizationBot): void {
    this.bot = bot;
    console.log("Bot injected into indexer");
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
  async indexAll(
    campaignCodeHash: string,
    pledgeCodeHash: string,
    receiptCodeHash?: string,
    pledgeLockCodeHash?: string
  ): Promise<{ campaigns: number; pledges: number; receipts: number }> {
    console.log("Indexing all cells...");

    // Fetch campaigns from RPC
    const campaignSearchKey = {
      script: {
        codeHash: campaignCodeHash,
        hashType: "data2" as const,
        args: "0x",
      },
      scriptType: "type" as const,
      scriptSearchMode: "prefix" as const,
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
      scriptSearchMode: "prefix" as const,
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

        // Extract creator lock script by finding an output whose lock hash matches creatorLockHash.
        // For finalized campaigns, the creator's lock is only in the original creation tx
        // (the finalization tx may be built by a non-creator), so use originalTxHash if available.
        // For Active campaigns, check the current tx (creation tx).
        let creatorLock: { codeHash: string; hashType: string; args: string } | null = null;
        const lookupTxHash = originalTxHash || cell.outPoint.txHash;
        try {
          const txData = await this.client.getTransaction(lookupTxHash);
          if (txData?.transaction) {
            for (const output of txData.transaction.outputs) {
              const script = ccc.Script.from(output.lock);
              const lockHash = script.hash();
              if (lockHash === data.creatorLockHash) {
                creatorLock = {
                  codeHash: script.codeHash,
                  hashType: script.hashType,
                  args: script.args,
                };
                break;
              }
            }
          }
        } catch (error) {
          console.warn(
            `Failed to fetch creator lock script for campaign ${outPointStr} (tx: ${lookupTxHash}):`,
            error instanceof Error ? error.message : String(error)
          );
        }

        dbCampaigns.push({
          id: outPointStr,
          tx_hash: cell.outPoint.txHash,
          output_index: Number(cell.outPoint.index),
          creator_lock_hash: data.creatorLockHash,
          creator_lock_code_hash: creatorLock?.codeHash || null,
          creator_lock_hash_type: creatorLock?.hashType || null,
          creator_lock_args: creatorLock?.args || null,
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

        // Extract backer lock script by finding an output whose lock hash matches backerLockHash
        let backerLock: { codeHash: string; hashType: string; args: string } | null = null;
        try {
          const txData = await this.client.getTransaction(cell.outPoint.txHash);
          if (txData?.transaction) {
            for (const output of txData.transaction.outputs) {
              const script = ccc.Script.from(output.lock);
              const lockHash = script.hash();
              if (lockHash === data.backerLockHash) {
                backerLock = {
                  codeHash: script.codeHash,
                  hashType: script.hashType,
                  args: script.args,
                };
                break;
              }
            }
          }
        } catch (error) {
          console.warn(
            `Failed to fetch backer lock script for pledge ${outPointStr} (tx: ${cell.outPoint.txHash}):`,
            error instanceof Error ? error.message : String(error)
          );
        }

        dbPledges.push({
          id: outPointStr,
          tx_hash: cell.outPoint.txHash,
          output_index: Number(cell.outPoint.index),
          campaign_id: data.campaignId,
          backer_lock_hash: data.backerLockHash,
          backer_lock_code_hash: backerLock?.codeHash || null,
          backer_lock_hash_type: backerLock?.hashType || null,
          backer_lock_args: backerLock?.args || null,
          amount: data.amount.toString(),
          created_at: blockNumber.toString(),
        });
      } catch (error) {
        console.error("Error parsing pledge cell:", error);
      }
    }

    // Fetch and parse receipt cells
    const dbReceipts: DBReceipt[] = [];
    if (receiptCodeHash) {
      const receiptSearchKey = {
        script: {
          codeHash: receiptCodeHash,
          hashType: "data2" as const,
          args: "0x",
        },
        scriptType: "type" as const,
        scriptSearchMode: "prefix" as const,
      };

      const receiptCells: ccc.Cell[] = [];
      for await (const cell of this.client.findCells(receiptSearchKey, "asc", 1000)) {
        receiptCells.push(cell);
      }

      for (const cell of receiptCells) {
        try {
          const outPointStr = `${cell.outPoint.txHash}_${cell.outPoint.index}`;
          const data = parseReceiptData(cell.outputData);
          const blockNumber = await this.getBlockNumberForTx(cell.outPoint.txHash);

          // Derive campaign_id by looking up the pledge cell in the same transaction
          let campaignId = "";
          try {
            const txWithStatus = await this.client.getTransaction(cell.outPoint.txHash);
            if (txWithStatus && txWithStatus.transaction) {
              const txOutputs = txWithStatus.transaction.outputs;
              const txOutputsData = txWithStatus.transaction.outputsData;
              for (let i = 0; i < txOutputs.length; i++) {
                const output = txOutputs[i];
                if (output.type && output.type.codeHash === pledgeCodeHash) {
                  const pledgeInfo = parsePledgeData(txOutputsData[i]);
                  campaignId = pledgeInfo.campaignId;
                  break;
                }
              }
            }
          } catch (error) {
            console.error("Error deriving campaign_id for receipt:", error);
          }

          dbReceipts.push({
            id: outPointStr,
            tx_hash: cell.outPoint.txHash,
            output_index: Number(cell.outPoint.index),
            campaign_id: campaignId,
            backer_lock_hash: data.backerLockHash,
            pledge_amount: data.pledgeAmount.toString(),
            status: "live",
            block_number: blockNumber.toString(),
            created_at: blockNumber.toString(),
          });
        } catch (error) {
          console.error("Error parsing receipt cell:", error);
        }
      }
    }

    // Atomically replace all data in DB
    try {
      this.db.replaceLiveCells(dbCampaigns, dbPledges, dbReceipts);
    } catch (error) {
      console.error("Error replacing live cells in DB:", error);
    }

    console.log(`Indexed ${dbCampaigns.length} campaigns, ${dbPledges.length} pledges, and ${dbReceipts.length} receipts`);
    return { campaigns: dbCampaigns.length, pledges: dbPledges.length, receipts: dbReceipts.length };
  }

  /**
   * Start background polling
   */
  startBackgroundIndexing(
    campaignCodeHash: string,
    pledgeCodeHash: string,
    intervalMs: number = 10000,
    receiptCodeHash?: string,
    pledgeLockCodeHash?: string
  ) {
    this.campaignCodeHash = campaignCodeHash;
    this.pledgeCodeHash = pledgeCodeHash;
    this.receiptCodeHash = receiptCodeHash || "";
    this.pledgeLockCodeHash = pledgeLockCodeHash || "";

    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }

    this.pollingTimer = setInterval(async () => {
      try {
        // 1. Index all campaigns/pledges from CKB
        await this.indexAll(
          this.campaignCodeHash,
          this.pledgeCodeHash,
          this.receiptCodeHash || undefined,
          this.pledgeLockCodeHash || undefined
        );

        // 2. (NEW) Run bot finalization checks
        if (this.bot) {
          await this.bot.processPendingFinalizations();
          await this.bot.releaseSuccessfulPledges();
          await this.bot.refundFailedPledges();
        }
      } catch (error) {
        console.error("Polling cycle error:", error);
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
    const linkageId = `${linkageHash}_0`;

    // Sum from live pledge cells
    const pledges = this.db.getAllPledges();
    let total = BigInt(0);
    for (const p of pledges) {
      if (p.campaign_id.toLowerCase() === linkageHash) {
        total += BigInt(p.amount);
      }
    }

    // If no live pledges (consumed after release/refund), fall back to receipt amounts
    // Receipts persist as proof-of-pledge even after fund distribution
    if (total === BigInt(0)) {
      const receipts = this.db.getAllReceipts();
      for (const r of receipts) {
        const rid = r.campaign_id.toLowerCase();
        if (rid === linkageHash || rid === linkageId) {
          total += BigInt(r.pledge_amount);
        }
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
   * Convert DB row to Receipt domain object
   */
  private dbToReceipt(row: DBReceipt): Receipt {
    return {
      id: row.id,
      txHash: row.tx_hash,
      index: row.output_index,
      campaignId: row.campaign_id,
      backerLockHash: row.backer_lock_hash,
      pledgeAmount: BigInt(row.pledge_amount),
      status: row.status,
      createdAt: BigInt(row.created_at),
    };
  }

  /**
   * Get all receipts
   */
  getReceipts(): Receipt[] {
    return this.db.getAllReceipts().map((row) => this.dbToReceipt(row));
  }

  /**
   * Get receipts for a specific campaign.
   * Uses originalTxHash linkage so receipts are found even after finalization
   * changes the campaign's outpoint.
   */
  getReceiptsForCampaign(campaignId: string): Receipt[] {
    const campaign = this.getCampaign(campaignId);
    if (campaign) {
      const linkageHash = this.getPledgeLinkageTxHash(campaign).toLowerCase();
      const linkageId = `${linkageHash}_0`;
      return this.db.getAllReceipts()
        .filter((r) => r.campaign_id.toLowerCase() === linkageHash || r.campaign_id.toLowerCase() === linkageId)
        .map((row) => this.dbToReceipt(row));
    }
    return this.db.getReceiptsForCampaign(campaignId).map((row) => this.dbToReceipt(row));
  }

  /**
   * Get receipts for a specific backer
   */
  getReceiptsForBacker(backerLockHash: string): Receipt[] {
    return this.db.getReceiptsForBacker(backerLockHash).map((row) => this.dbToReceipt(row));
  }

  /**
   * Get count of unique backers across pledges and receipts for a campaign.
   * Uses the same linkage pattern as getPledgesForCampaign/getReceiptsForCampaign
   * because pledge campaign_id is a type script hash, not the campaign outpoint ID.
   */
  getUniqueBackerCount(campaignId: string): number {
    const campaign = this.getCampaign(campaignId);
    const backers = new Set<string>();

    if (campaign) {
      const linkageHash = this.getPledgeLinkageTxHash(campaign).toLowerCase();
      const linkageId = `${linkageHash}_0`;

      for (const p of this.db.getAllPledges()) {
        if (p.campaign_id.toLowerCase() === linkageHash) {
          backers.add(p.backer_lock_hash.toLowerCase());
        }
      }
      for (const r of this.db.getAllReceipts()) {
        const rid = r.campaign_id.toLowerCase();
        if (rid === linkageHash || rid === linkageId) {
          backers.add(r.backer_lock_hash.toLowerCase());
        }
      }
    } else {
      // Fallback: strip _N suffix and match directly
      const txHashOnly = campaignId.includes("_") ? campaignId.split("_")[0] : campaignId;
      const normalized = txHashOnly.toLowerCase();

      for (const p of this.db.getAllPledges()) {
        if (p.campaign_id.toLowerCase() === normalized) {
          backers.add(p.backer_lock_hash.toLowerCase());
        }
      }
      for (const r of this.db.getAllReceipts()) {
        if (r.campaign_id.toLowerCase() === normalized) {
          backers.add(r.backer_lock_hash.toLowerCase());
        }
      }
    }

    return backers.size;
  }

  /**
   * Get current block number via direct RPC call.
   * Uses raw JSON-RPC instead of client.getTip() because CCC's ClientPublicTestnet
   * returns the testnet tip even when configured with a custom (devnet) URL.
   */
  async getCurrentBlockNumber(): Promise<bigint> {
    const res = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "get_tip_block_number", params: [] }),
    });
    const json = (await res.json()) as { result: string };
    return BigInt(json.result);
  }
}
