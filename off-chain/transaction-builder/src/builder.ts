import { ccc } from "@ckb-ccc/core";
import { CampaignParams, PledgeParams, ContractInfo, TxResult, FinalizeCampaignParams, RefundPledgeParams, ReleasePledgeParams, DestroyCampaignParams, CreatePledgeWithReceiptParams, PermissionlessReleaseParams, PermissionlessRefundParams, MergeContributionsParams } from "./types";
import { serializeCampaignData, serializePledgeData, serializeCampaignDataWithStatus, calculateCellCapacity, getMetadataSize, serializeReceiptData, serializePledgeLockArgs, encodeDeadlineBlockAsLockArgs } from "./serializer";
import { createCkbClient, NetworkType } from "./ckbClient";

/**
 * Transaction builder for creating campaigns and pledges
 */
export class TransactionBuilder {
  private client: ccc.Client;
  private campaignContract: ContractInfo;
  private campaignLockContract: ContractInfo;
  private pledgeContract: ContractInfo;
  private pledgeLockContract: ContractInfo;
  private receiptContract: ContractInfo;

  constructor(
    client: ccc.Client,
    campaignContract: ContractInfo,
    campaignLockContract: ContractInfo,
    pledgeContract: ContractInfo,
    pledgeLockContract: ContractInfo,
    receiptContract: ContractInfo
  ) {
    this.client = client;
    this.campaignContract = campaignContract;
    this.campaignLockContract = campaignLockContract;
    this.pledgeContract = pledgeContract;
    this.pledgeLockContract = pledgeLockContract;
    this.receiptContract = receiptContract;
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

    // Encode deadline block as lock args (8 bytes, LE)
    const deadlineArgs = encodeDeadlineBlockAsLockArgs(params.deadlineBlock);
    console.log(`Deadline block ${params.deadlineBlock} encoded as lock args: ${deadlineArgs}`);

    // Campaign-lock script: code hash + deadline args
    const lockScript = {
      codeHash: this.campaignLockContract.codeHash,
      hashType: this.campaignLockContract.hashType,
      args: deadlineArgs,
    };

    // Build the transaction
    const tx = ccc.Transaction.from({
      outputs: [
        {
          capacity,
          lock: lockScript,
          type: {
            codeHash: this.campaignContract.codeHash,
            hashType: this.campaignContract.hashType,
            args: "0x" + "00".repeat(32), // Placeholder for TypeID (32 bytes)
          },
        },
      ],
      outputsData: [campaignData],
      cellDeps: [
        {
          outPoint: {
            txHash: this.campaignLockContract.txHash,
            index: this.campaignLockContract.index,
          },
          depType: "code",
        },
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

    // Compute TypeID args: blake2b(molecule_serialized_first_input || output_index_u64_le)
    // Per CKB RFC-0022, TypeID = blake2b(CellInput molecule bytes || u64 LE output index)
    const firstInput = ccc.CellInput.from(tx.inputs[0]);
    const serializedInput = firstInput.toBytes();
    const outputIndexBytes = ccc.numLeToBytes(0, 8); // campaign is output[0]
    const hasher = new ccc.HasherCkb();
    hasher.update(serializedInput);
    hasher.update(outputIndexBytes);
    const typeIdArgs = hasher.digest();
    tx.outputs[0].type!.args = typeIdArgs;
    console.log(`TypeID args: ${typeIdArgs}`);

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
   * Returns excess capacity from the campaign cell to the creator as a change output.
   */
  async finalizeCampaign(signer: ccc.Signer, params: FinalizeCampaignParams): Promise<string> {
    console.log("Building finalize campaign transaction...");

    // Serialize new campaign data with updated status
    const newCampaignData = serializeCampaignDataWithStatus(params.campaignData, params.newStatus);
    console.log(`New campaign data: ${newCampaignData}`);

    // Calculate minimum capacity for the campaign cell (65 bytes header + metadata)
    const metadataSize = (params.campaignData.title || params.campaignData.description) ? getMetadataSize(params.campaignData.title, params.campaignData.description) : 0;
    const dataSize = 65 + metadataSize;
    const minCapacity = calculateCellCapacity(dataSize, true, 65);
    console.log(`Minimum capacity required: ${minCapacity} shannons`);

    // Fetch the original campaign cell to preserve TypeID args and get original capacity
    const campaignTx = await this.client.getTransaction(params.campaignOutPoint.txHash);
    const originalOutput = campaignTx!.transaction!.outputs[params.campaignOutPoint.index];
    const typeIdArgs = originalOutput.type!.args;
    const originalCapacity = BigInt(originalOutput.capacity);
    console.log(`Original campaign cell capacity: ${originalCapacity} shannons`);

    // Calculate excess capacity to return to creator
    const excessCapacity = originalCapacity - minCapacity;
    console.log(`Excess capacity to return to creator: ${excessCapacity} shannons`);

    // Since value: raw deadline block number (same pattern as pledge-lock)
    // CKB devnet doesn't enforce since at consensus layer; the campaign-lock script
    // reads the since value via load_input_since() and validates against the deadline in args.
    const deadlineBlock = params.campaignData.deadlineBlock;
    const sinceValue = BigInt(deadlineBlock);
    console.log(`Since value for deadline ${deadlineBlock}: ${sinceValue}`);

    // Encode deadline block as lock args (8 bytes, LE) - same as createCampaign
    const deadlineArgs = encodeDeadlineBlockAsLockArgs(deadlineBlock);

    // Build outputs array: campaign cell + creator change output (if excess > 0)
    const outputs: any[] = [
      {
        capacity: minCapacity,
        lock: {
          codeHash: this.campaignLockContract.codeHash,
          hashType: this.campaignLockContract.hashType,
          args: deadlineArgs,
        },
        type: {
          codeHash: this.campaignContract.codeHash,
          hashType: this.campaignContract.hashType,
          args: typeIdArgs,
        },
      },
    ];

    const outputsData: string[] = [newCampaignData];

    // Add creator change output if there's excess capacity
    if (excessCapacity > 0n) {
      console.log("Adding creator change output with excess capacity");

      // Reconstruct creator's lock script from creatorLockHash
      // Use default SECP256K1 lock script parameters
      outputs.push({
        capacity: excessCapacity,
        lock: {
          codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
          hashType: "type",
          args: params.campaignData.creatorLockHash,
        },
      });
    }

    // Build the transaction: consume old campaign cell, create new one with updated status + change
    const tx = ccc.Transaction.from({
      inputs: [
        {
          previousOutput: {
            txHash: params.campaignOutPoint.txHash,
            index: params.campaignOutPoint.index,
          },
          since: sinceValue,  // Raw deadline block number
        },
      ],
      outputs,
      outputsData,
      cellDeps: [
        {
          outPoint: {
            txHash: this.campaignLockContract.txHash,
            index: this.campaignLockContract.index,
          },
          depType: "code",
        },
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
   * Create a pledge with receipt (v1.1 trustless model)
   * Produces: [0] pledge cell with custom pledge lock, [1] receipt cell owned by backer
   */
  async createPledgeWithReceipt(signer: ccc.Signer, params: CreatePledgeWithReceiptParams): Promise<string> {
    console.log("Building create pledge with receipt transaction...");

    // Serialize pledge cell data (72 bytes): campaign_id + backer_lock_hash + amount
    const pledgeData = serializePledgeData({
      campaignId: params.campaignId,
      backerLockHash: params.backerLockHash,
      amount: params.amount,
    });

    // Serialize receipt cell data (40 bytes): pledge_amount + backer_lock_hash
    const receiptData = serializeReceiptData(params.amount, params.backerLockHash);

    // Serialize pledge lock args (72 bytes): campaign_type_script_hash + deadline + backer_lock_hash
    const pledgeLockArgs = serializePledgeLockArgs(
      params.campaignTypeScriptHash,
      params.deadlineBlock,
      params.backerLockHash
    );

    // Calculate capacities
    const pledgeDataSize = 72;
    const pledgeBaseCapacity = calculateCellCapacity(pledgeDataSize, true, 65);
    const pledgeTotalCapacity = pledgeBaseCapacity + params.amount;

    const receiptDataSize = 40;
    const receiptCapacity = calculateCellCapacity(receiptDataSize, true, 65);

    // Get backer's lock script (backer owns the receipt cell)
    const backerAddress = await signer.getRecommendedAddress();
    const backerLockScript = (await ccc.Address.fromString(backerAddress, this.client)).script;

    console.log(`  Pledge capacity: ${pledgeTotalCapacity} shannons`);
    console.log(`  Receipt capacity: ${receiptCapacity} shannons`);

    // Build the transaction
    const tx = ccc.Transaction.from({
      outputs: [
        {
          // [0] Pledge cell with custom pledge lock
          capacity: pledgeTotalCapacity,
          lock: {
            codeHash: this.pledgeLockContract.codeHash,
            hashType: this.pledgeLockContract.hashType,
            args: pledgeLockArgs,
          },
          type: {
            codeHash: this.pledgeContract.codeHash,
            hashType: this.pledgeContract.hashType,
            args: "0x",
          },
        },
        {
          // [1] Receipt cell owned by backer
          capacity: receiptCapacity,
          lock: backerLockScript,
          type: {
            codeHash: this.receiptContract.codeHash,
            hashType: this.receiptContract.hashType,
            args: "0x",
          },
        },
      ],
      outputsData: [pledgeData, receiptData],
      cellDeps: [
        {
          outPoint: {
            txHash: this.pledgeContract.txHash,
            index: this.pledgeContract.index,
          },
          depType: "code",
        },
        {
          outPoint: {
            txHash: this.pledgeLockContract.txHash,
            index: this.pledgeLockContract.index,
          },
          depType: "code",
        },
        {
          outPoint: {
            txHash: this.receiptContract.txHash,
            index: this.receiptContract.index,
          },
          depType: "code",
        },
        {
          // Campaign cell as cell_dep (receipt script may verify pledge context)
          outPoint: {
            txHash: params.campaignOutPoint.txHash,
            index: params.campaignOutPoint.index,
          },
          depType: "code",
        },
      ],
    });

    // Complete inputs and fee (backer's cells)
    await tx.completeInputsByCapacity(signer);
    await tx.completeFeeBy(signer, 1000);

    console.log("Signing pledge with receipt transaction...");
    const txHash = await signer.sendTransaction(tx);
    console.log(`Pledge with receipt created! TX: ${txHash}`);

    return txHash;
  }

  /**
   * Permissionless release: anyone triggers after deadline when campaign succeeded.
   * Pledge lock routes funds to creator's lock script.
   * The signer only provides fee cells -- the pledge cell is an explicit input.
   */
  async permissionlessRelease(signer: ccc.Signer, params: PermissionlessReleaseParams): Promise<string> {
    console.log("Building permissionless release transaction...");

    // Since value: absolute block number for deadline enforcement
    const sinceValue = params.deadlineBlock;

    // Deduct tx fee from pledge capacity (pledge lock allows up to 1 CKB fee deduction)
    const txFee = BigInt(100000); // 0.001 CKB fee — well within MAX_FEE (1 CKB)
    const creatorCapacity = params.pledgeCapacity - txFee;

    // Build the transaction
    const tx = ccc.Transaction.from({
      inputs: [
        {
          // Pledge cell with custom pledge lock (explicit input, not from signer)
          previousOutput: {
            txHash: params.pledgeOutPoint.txHash,
            index: params.pledgeOutPoint.index,
          },
          since: sinceValue,
        },
      ],
      outputs: [
        {
          // Creator receives the pledge funds (minus small fee)
          capacity: creatorCapacity,
          lock: {
            codeHash: params.creatorLockScript.codeHash,
            hashType: params.creatorLockScript.hashType as "type" | "data" | "data1" | "data2",
            args: params.creatorLockScript.args,
          },
        },
      ],
      outputsData: ["0x"],
      cellDeps: [
        {
          // Campaign cell (status = Success, for pledge lock verification)
          outPoint: {
            txHash: params.campaignCellDep.txHash,
            index: params.campaignCellDep.index,
          },
          depType: "code",
        },
        {
          outPoint: {
            txHash: this.pledgeLockContract.txHash,
            index: this.pledgeLockContract.index,
          },
          depType: "code",
        },
        {
          outPoint: {
            txHash: this.pledgeContract.txHash,
            index: this.pledgeContract.index,
          },
          depType: "code",
        },
      ],
    });

    console.log("Signing permissionless release transaction...");
    const txHash = await signer.sendTransaction(tx);
    console.log(`Permissionless release completed! TX: ${txHash}`);

    return txHash;
  }

  /**
   * Permissionless refund: triggered after deadline when campaign failed.
   * Pledge lock routes funds to backer. Receipt cell is consumed to prove backer identity.
   * The signer provides fee cells and signs for the receipt cell (backer must be the signer).
   */
  async permissionlessRefund(signer: ccc.Signer, params: PermissionlessRefundParams): Promise<string> {
    console.log("Building permissionless refund transaction...");

    // Since value for pledge cell: absolute block number >= deadline
    const sinceValue = params.deadlineBlock;

    // Total capacity returned to backer: pledge capacity + receipt capacity (minus small fee)
    const txFee = BigInt(100000); // 0.001 CKB fee — within MAX_FEE (1 CKB)
    const backerOutputCapacity = params.pledgeCapacity + params.receiptCapacity - txFee;

    // Build cell deps
    const cellDeps: Array<{ outPoint: { txHash: string; index: number }; depType: "code" | "depGroup" }> = [
      {
        outPoint: {
          txHash: this.pledgeLockContract.txHash,
          index: this.pledgeLockContract.index,
        },
        depType: "code",
      },
      {
        outPoint: {
          txHash: this.pledgeContract.txHash,
          index: this.pledgeContract.index,
        },
        depType: "code",
      },
      {
        outPoint: {
          txHash: this.receiptContract.txHash,
          index: this.receiptContract.index,
        },
        depType: "code",
      },
    ];

    // Campaign cell_dep is optional (fail-safe refund works without it)
    if (params.campaignCellDep) {
      cellDeps.push({
        outPoint: {
          txHash: params.campaignCellDep.txHash,
          index: params.campaignCellDep.index,
        },
        depType: "code",
      });
    }

    // Build the transaction
    const tx = ccc.Transaction.from({
      inputs: [
        {
          // Pledge cell (custom pledge lock)
          previousOutput: {
            txHash: params.pledgeOutPoint.txHash,
            index: params.pledgeOutPoint.index,
          },
          since: sinceValue,
        },
        {
          // Receipt cell (backer's secp256k1 lock -- signer must be backer)
          previousOutput: {
            txHash: params.receiptOutPoint.txHash,
            index: params.receiptOutPoint.index,
          },
        },
      ],
      outputs: [
        {
          // Backer receives refund
          capacity: backerOutputCapacity,
          lock: {
            codeHash: params.backerLockScript.codeHash,
            hashType: params.backerLockScript.hashType as "type" | "data" | "data1" | "data2",
            args: params.backerLockScript.args,
          },
        },
      ],
      outputsData: ["0x"],
      cellDeps,
    });

    console.log("Signing permissionless refund transaction...");
    const txHash = await signer.sendTransaction(tx);
    console.log(`Permissionless refund completed! TX: ${txHash}`);

    return txHash;
  }

  /**
   * Merge N pledge cells into 1 (same backer, same campaign)
   * All pledge cells must have identical pledge lock args.
   * Since=0 means merge is allowed before deadline.
   */
  async mergeContributions(signer: ccc.Signer, params: MergeContributionsParams): Promise<string> {
    console.log(`Building merge contributions transaction (${params.pledgeOutPoints.length} inputs)...`);

    if (params.pledgeOutPoints.length < 2) {
      throw new Error("Merge requires at least 2 pledge cells");
    }
    if (params.pledgeOutPoints.length !== params.pledgeCapacities.length) {
      throw new Error("pledgeOutPoints and pledgeCapacities must have the same length");
    }

    // All inputs: pledge cells with since=0 (before-deadline merge path)
    const inputs = params.pledgeOutPoints.map((outPoint) => ({
      previousOutput: {
        txHash: outPoint.txHash,
        index: outPoint.index,
      },
      since: BigInt(0),
    }));

    // Sum all capacities for the merged output (no fee deduction — merge preserves capacity exactly)
    const totalCapacity = params.pledgeCapacities.reduce((sum, cap) => sum + cap, BigInt(0));

    // Serialize merged pledge data
    const mergedPledgeData = serializePledgeData({
      campaignId: params.campaignId,
      backerLockHash: params.backerLockHash,
      amount: params.totalAmount,
    });

    console.log(`  Total capacity: ${totalCapacity} shannons`);
    console.log(`  Total amount: ${params.totalAmount} shannons`);

    // Build the transaction
    const tx = ccc.Transaction.from({
      inputs,
      outputs: [
        {
          // Merged pledge cell: same lock and type as inputs
          capacity: totalCapacity,
          lock: {
            codeHash: this.pledgeLockContract.codeHash,
            hashType: this.pledgeLockContract.hashType,
            args: params.pledgeLockArgs,
          },
          type: {
            codeHash: this.pledgeContract.codeHash,
            hashType: this.pledgeContract.hashType,
            args: "0x",
          },
        },
      ],
      outputsData: [mergedPledgeData],
      cellDeps: [
        {
          outPoint: {
            txHash: this.pledgeLockContract.txHash,
            index: this.pledgeLockContract.index,
          },
          depType: "code",
        },
        {
          outPoint: {
            txHash: this.pledgeContract.txHash,
            index: this.pledgeContract.index,
          },
          depType: "code",
        },
      ],
    });

    // Add a separate fee cell from the signer (must not touch the merge output capacity)
    await tx.addCellDepsOfKnownScripts(this.client, ccc.KnownScript.Secp256k1Blake160);
    await tx.completeInputsByCapacity(signer);
    await tx.completeFeeBy(signer, 1000);

    // Restore merge output capacity (completeFeeBy may have adjusted it)
    tx.outputs[0].capacity = totalCapacity;

    console.log("Signing merge contributions transaction...");
    const txHash = await signer.sendTransaction(tx);
    console.log(`Pledge cells merged! TX: ${txHash}`);

    return txHash;
  }

  /**
   * Helper: Get campaign lock contract info
   */
  getCampaignLockContract(): ContractInfo {
    return this.campaignLockContract;
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
 * @param campaignLockContract - Campaign lock contract info (v1.1)
 * @param pledgeContract - Pledge contract info
 * @param pledgeLockContract - Pledge lock contract info (v1.1)
 * @param receiptContract - Receipt contract info (v1.1)
 * @param network - Network type: "devnet" | "testnet" | "mainnet" (default: auto-detect from rpcUrl)
 */
export function createTransactionBuilder(
  rpcUrl: string,
  campaignContract: ContractInfo,
  campaignLockContract: ContractInfo,
  pledgeContract: ContractInfo,
  pledgeLockContract: ContractInfo,
  receiptContract: ContractInfo,
  network?: NetworkType
): TransactionBuilder {
  // Auto-detect network if not explicitly specified
  const resolvedNetwork = network ?? (
    (rpcUrl.includes("127.0.0.1") || rpcUrl.includes("localhost")) ? "devnet" : "testnet"
  );

  const client = createCkbClient(resolvedNetwork, rpcUrl);
  return new TransactionBuilder(client, campaignContract, campaignLockContract, pledgeContract, pledgeLockContract, receiptContract);
}
