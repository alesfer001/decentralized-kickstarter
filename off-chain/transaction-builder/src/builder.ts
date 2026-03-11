import { ccc } from "@ckb-ccc/core";
import { CampaignParams, PledgeParams, ContractInfo, TxResult, FinalizeCampaignParams, RefundPledgeParams, ReleasePledgeParams, DestroyCampaignParams } from "./types";
import { serializeCampaignData, serializePledgeData, serializeCampaignDataWithStatus, calculateCellCapacity, getMetadataSize } from "./serializer";
import { createDevnetClient } from "./devnetClient";

/**
 * Transaction builder for creating campaigns and pledges
 */
export class TransactionBuilder {
  private client: ccc.Client;
  private campaignContract: ContractInfo;
  private pledgeContract: ContractInfo;

  constructor(client: ccc.Client, campaignContract: ContractInfo, pledgeContract: ContractInfo) {
    this.client = client;
    this.campaignContract = campaignContract;
    this.pledgeContract = pledgeContract;
  }

  /**
   * Create a campaign transaction
   * @param signer - CCC signer (wallet)
   * @param params - Campaign parameters
   * @returns Transaction hash
   */
  async createCampaign(signer: ccc.Signer, params: CampaignParams): Promise<string> {
    console.log("Building create campaign transaction...");

    // Serialize campaign data
    const campaignData = serializeCampaignData(params);
    console.log(`Campaign data: ${campaignData}`);

    // Calculate required capacity (65 bytes header + metadata)
    const metadataSize = (params.title || params.description) ? getMetadataSize(params.title, params.description) : 0;
    const dataSize = 65 + metadataSize;
    const capacity = calculateCellCapacity(dataSize, true, 65);
    console.log(`Required capacity: ${capacity} shannons (${Number(capacity) / 100000000} CKB)`);

    // Get the lock script from signer
    const lock = await signer.getRecommendedAddress();
    const lockScript = (await ccc.Address.fromString(lock, this.client)).script;

    // Build the transaction
    const tx = ccc.Transaction.from({
      outputs: [
        {
          capacity,
          lock: lockScript,
          type: {
            codeHash: this.campaignContract.codeHash,
            hashType: this.campaignContract.hashType,
            args: "0x", // No args for now
          },
        },
      ],
      outputsData: [campaignData],
      cellDeps: [
        {
          outPoint: {
            txHash: this.campaignContract.txHash,
            index: this.campaignContract.index,
          },
          depType: "code",
        },
      ],
    });

    // Complete the transaction (add inputs to cover capacity + fee)
    await tx.completeInputsByCapacity(signer);
    await tx.completeFeeBy(signer, 1000); // 1000 shannons/KB fee rate

    // Sign and send
    console.log("Signing transaction...");
    const txHash = await signer.sendTransaction(tx);
    console.log(`Campaign created! TX: ${txHash}`);

    return txHash;
  }

  /**
   * Create a pledge transaction
   * @param signer - CCC signer (wallet)
   * @param params - Pledge parameters
   * @returns Transaction hash
   */
  async createPledge(signer: ccc.Signer, params: PledgeParams): Promise<string> {
    console.log("Building create pledge transaction...");

    // Serialize pledge data
    const pledgeData = serializePledgeData(params);
    console.log(`Pledge data: ${pledgeData}`);

    // Calculate required capacity (pledge amount + cell overhead)
    const dataSize = 72; // Pledge data structure size
    const baseCapacity = calculateCellCapacity(dataSize, true, 65);
    const totalCapacity = baseCapacity + params.amount; // Base + pledge amount

    console.log(`Required capacity: ${totalCapacity} shannons (${Number(totalCapacity) / 100000000} CKB)`);
    console.log(`  - Base cell: ${baseCapacity} shannons`);
    console.log(`  - Pledge amount: ${params.amount} shannons`);

    // Get the lock script from signer
    const lock = await signer.getRecommendedAddress();
    const lockScript = (await ccc.Address.fromString(lock, this.client)).script;

    // Build the transaction
    const tx = ccc.Transaction.from({
      outputs: [
        {
          capacity: totalCapacity,
          lock: lockScript,
          type: {
            codeHash: this.pledgeContract.codeHash,
            hashType: this.pledgeContract.hashType,
            args: "0x", // No args for now
          },
        },
      ],
      outputsData: [pledgeData],
      cellDeps: [
        {
          outPoint: {
            txHash: this.pledgeContract.txHash,
            index: this.pledgeContract.index,
          },
          depType: "code",
        },
      ],
    });

    // Complete the transaction (add inputs to cover capacity + fee)
    await tx.completeInputsByCapacity(signer);
    await tx.completeFeeBy(signer, 1000); // 1000 shannons/KB fee rate

    // Sign and send
    console.log("Signing transaction...");
    const txHash = await signer.sendTransaction(tx);
    console.log(`Pledge created! TX: ${txHash}`);

    return txHash;
  }

  /**
   * Finalize a campaign (transition from Active to Success/Failed)
   * Consumes the old campaign cell and creates a new one with updated status.
   */
  async finalizeCampaign(signer: ccc.Signer, params: FinalizeCampaignParams): Promise<string> {
    console.log("Building finalize campaign transaction...");

    // Serialize new campaign data with updated status
    const newCampaignData = serializeCampaignDataWithStatus(params.campaignData, params.newStatus);
    console.log(`New campaign data: ${newCampaignData}`);

    // Get the signer's lock script
    const address = await signer.getRecommendedAddress();
    const lockScript = (await ccc.Address.fromString(address, this.client)).script;

    // Calculate capacity for the campaign cell (65 bytes header + metadata)
    const metadataSize = (params.campaignData.title || params.campaignData.description) ? getMetadataSize(params.campaignData.title, params.campaignData.description) : 0;
    const dataSize = 65 + metadataSize;
    const capacity = calculateCellCapacity(dataSize, true, 65);

    // Build the transaction: consume old campaign cell, create new one with updated status
    const tx = ccc.Transaction.from({
      inputs: [
        {
          previousOutput: {
            txHash: params.campaignOutPoint.txHash,
            index: params.campaignOutPoint.index,
          },
        },
      ],
      outputs: [
        {
          capacity,
          lock: lockScript,
          type: {
            codeHash: this.campaignContract.codeHash,
            hashType: this.campaignContract.hashType,
            args: "0x",
          },
        },
      ],
      outputsData: [newCampaignData],
      cellDeps: [
        {
          outPoint: {
            txHash: this.campaignContract.txHash,
            index: this.campaignContract.index,
          },
          depType: "code",
        },
      ],
    });

    // Complete fee (may add more inputs for fee)
    await tx.completeFeeBy(signer, 1000);

    console.log("Signing finalize transaction...");
    const txHash = await signer.sendTransaction(tx);
    console.log(`Campaign finalized! TX: ${txHash}`);

    return txHash;
  }

  /**
   * Refund a pledge (backer reclaims their CKB)
   * Consumes the pledge cell, creates a plain output (no type script) back to the backer.
   */
  async refundPledge(signer: ccc.Signer, params: RefundPledgeParams): Promise<string> {
    console.log("Building refund pledge transaction...");

    // Get the backer's lock script
    const address = await signer.getRecommendedAddress();
    const lockScript = (await ccc.Address.fromString(address, this.client)).script;

    // Build the transaction: consume pledge cell, return CKB to backer (no type script)
    const tx = ccc.Transaction.from({
      inputs: [
        {
          previousOutput: {
            txHash: params.pledgeOutPoint.txHash,
            index: params.pledgeOutPoint.index,
          },
        },
      ],
      outputs: [
        {
          capacity: params.pledgeCapacity,
          lock: lockScript,
          // No type script — plain CKB cell
        },
      ],
      outputsData: ["0x"],
      cellDeps: [
        {
          outPoint: {
            txHash: this.pledgeContract.txHash,
            index: this.pledgeContract.index,
          },
          depType: "code",
        },
      ],
    });

    // Complete fee
    await tx.completeFeeBy(signer, 1000);

    console.log("Signing refund transaction...");
    const txHash = await signer.sendTransaction(tx);
    console.log(`Pledge refunded! TX: ${txHash}`);

    return txHash;
  }

  /**
   * Release a pledge to the campaign creator
   * Consumes the pledge cell, creates a plain output to the creator's address.
   */
  async releasePledgeToCreator(signer: ccc.Signer, params: ReleasePledgeParams): Promise<string> {
    console.log("Building release pledge transaction...");

    // Get the creator's lock script from their address
    const creatorLockScript = (await ccc.Address.fromString(params.creatorAddress, this.client)).script;

    // Get the backer's lock script (for change)
    const backerAddress = await signer.getRecommendedAddress();
    const backerLockScript = (await ccc.Address.fromString(backerAddress, this.client)).script;

    // Build the transaction: consume pledge cell, send CKB to creator (no type script)
    const tx = ccc.Transaction.from({
      inputs: [
        {
          previousOutput: {
            txHash: params.pledgeOutPoint.txHash,
            index: params.pledgeOutPoint.index,
          },
        },
      ],
      outputs: [
        {
          capacity: params.pledgeCapacity,
          lock: creatorLockScript,
          // No type script — plain CKB cell
        },
      ],
      outputsData: ["0x"],
      cellDeps: [
        {
          outPoint: {
            txHash: this.pledgeContract.txHash,
            index: this.pledgeContract.index,
          },
          depType: "code",
        },
      ],
    });

    // Complete fee (backer pays)
    await tx.completeFeeBy(signer, 1000);

    console.log("Signing release transaction...");
    const txHash = await signer.sendTransaction(tx);
    console.log(`Pledge released to creator! TX: ${txHash}`);

    return txHash;
  }

  /**
   * Destroy a finalized campaign cell (reclaim CKB capacity)
   * Consumes the campaign cell, creates a plain output (no type script) back to the creator.
   */
  async destroyCampaign(signer: ccc.Signer, params: DestroyCampaignParams): Promise<string> {
    console.log("Building destroy campaign transaction...");

    // Get the creator's lock script
    const address = await signer.getRecommendedAddress();
    const lockScript = (await ccc.Address.fromString(address, this.client)).script;

    // Build the transaction: consume campaign cell, return CKB to creator (no type script)
    const tx = ccc.Transaction.from({
      inputs: [
        {
          previousOutput: {
            txHash: params.campaignOutPoint.txHash,
            index: params.campaignOutPoint.index,
          },
        },
      ],
      outputs: [
        {
          capacity: params.campaignCapacity,
          lock: lockScript,
          // No type script — plain CKB cell
        },
      ],
      outputsData: ["0x"],
      cellDeps: [
        {
          outPoint: {
            txHash: this.campaignContract.txHash,
            index: this.campaignContract.index,
          },
          depType: "code",
        },
      ],
    });

    // Complete fee
    await tx.completeFeeBy(signer, 1000);

    console.log("Signing destroy transaction...");
    const txHash = await signer.sendTransaction(tx);
    console.log(`Campaign destroyed! TX: ${txHash}`);

    return txHash;
  }

  /**
   * Helper: Get lock hash from address
   */
  async getLockHashFromAddress(address: string): Promise<string> {
    const addr = await ccc.Address.fromString(address, this.client);
    return addr.script.hash();
  }

  /**
   * Helper: Wait for transaction confirmation
   */
  async waitForTransaction(txHash: string, timeout: number = 60000): Promise<void> {
    console.log(`Waiting for transaction ${txHash} to be confirmed...`);

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const tx = await this.client.getTransaction(txHash);
        if (tx && tx.status === "committed") {
          console.log("Transaction confirmed!");
          return;
        }
      } catch (error) {
        // Transaction not found yet, continue waiting
      }

      // Wait 3 seconds before checking again
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    throw new Error(`Transaction ${txHash} not confirmed after ${timeout}ms`);
  }
}

/**
 * Create a transaction builder instance
 *
 * @param rpcUrl - RPC URL for the CKB node
 * @param campaignContract - Campaign contract info
 * @param pledgeContract - Pledge contract info
 * @param isDevnet - Set to true when using OffCKB local devnet (default: true for localhost)
 */
export function createTransactionBuilder(
  rpcUrl: string,
  campaignContract: ContractInfo,
  pledgeContract: ContractInfo,
  isDevnet?: boolean
): TransactionBuilder {
  // Auto-detect devnet if not explicitly specified
  const useDevnet = isDevnet ?? (rpcUrl.includes("127.0.0.1") || rpcUrl.includes("localhost"));

  const client = useDevnet
    ? createDevnetClient(rpcUrl)
    : new ccc.ClientPublicTestnet({ url: rpcUrl });

  return new TransactionBuilder(client, campaignContract, pledgeContract);
}
