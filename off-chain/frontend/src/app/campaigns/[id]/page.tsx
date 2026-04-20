"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ccc } from "@ckb-ccc/connector-react";
import { Campaign, Pledge, CampaignStatus, Receipt, PledgeDistributionStatus } from "@/lib/types";
import { fetchCampaign, fetchPledgesForCampaign, fetchBlockNumber, fetchReceiptsForCampaign } from "@/lib/api";
import {
  shannonsToCKB,
  ckbToShannons,
  formatHash,
  getEffectiveStatusLabel,
  getEffectiveStatusColor,
  getFundingProgress,
  blocksToTimeEstimate,
  blockToRelativeTime,
  getPledgeDistributionLabel,
  getPledgeDistributionColor,
  getExplorerTxUrl,
  getDistributionSummary,
  calculateCostBreakdown,
  formatCost,
} from "@/lib/utils";
import { CONTRACTS, PLEDGE_DATA_SIZE, RECEIPT_DATA_SIZE, EXPLORER_URL } from "@/lib/constants";
import { u64ToHexLE, serializeMetadataHex } from "@/lib/serialization";
import { useDevnet } from "@/components/DevnetContext";
import { useToast } from "@/components/Toast";
import { SkeletonDetailPage } from "@/components/Skeleton";

type PledgeSortMode = "recent" | "amount";

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;
  const { open } = ccc.useCcc();
  const walletSigner = ccc.useSigner();
  const { isDevnet, devnetSigner } = useDevnet();
  const { toast } = useToast();

  const signer = isDevnet ? devnetSigner : walletSigner;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [pledges, setPledges] = useState<Pledge[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [currentBlock, setCurrentBlock] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pledge form state
  const [pledgeAmount, setPledgeAmount] = useState("");
  const [pledging, setPledging] = useState(false);
  const [pledgeError, setPledgeError] = useState<string | null>(null);
  const [pledgeTxHash, setPledgeTxHash] = useState<string | null>(null);

  // Action state
  const [actionLoading, setActionLoading] = useState(false);
  const [actionTxHash, setActionTxHash] = useState<string | null>(null);
  const [walletLockHash, setWalletLockHash] = useState<string | null>(null);

  // UI state
  const [showCampaignId, setShowCampaignId] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const [pledgeSortMode, setPledgeSortMode] = useState<PledgeSortMode>("recent");
  const [txProgress, setTxProgress] = useState<"submitted" | "pending" | "confirmed" | null>(null);

  // Get wallet lock hash when signer changes
  useEffect(() => {
    async function getWalletInfo() {
      if (!signer) {
        setWalletLockHash(null);
        return;
      }
      try {
        const address = await signer.getRecommendedAddress();
        const client = signer.client;
        const addressObj = await ccc.Address.fromString(address, client);
        const lockHash = addressObj.script.hash();
        setWalletLockHash(lockHash);
      } catch {
        setWalletLockHash(null);
      }
    }
    getWalletInfo();
  }, [signer]);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    if (!isRefresh) setError(null);

    try {
      const [campaignData, pledgesData, blockNum, receiptsData] = await Promise.all([
        fetchCampaign(campaignId),
        fetchPledgesForCampaign(campaignId),
        fetchBlockNumber(),
        fetchReceiptsForCampaign(campaignId).catch(() => [] as Receipt[]),
      ]);

      if (!campaignData) {
        if (!isRefresh) setError("Campaign not found");
      } else {
        setCampaign(campaignData);
        setPledges(pledgesData);
        setCurrentBlock(blockNum);
        setReceipts(receiptsData);
      }
    } catch (err) {
      if (!isRefresh) {
        setError(err instanceof Error ? err.message : "Failed to load campaign");
      }
    } finally {
      if (!isRefresh) setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => loadData(true), 15000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Poll for changes after a transaction
  async function pollForChange(checkFn: () => Promise<boolean>, maxAttempts = 15) {
    setTxProgress("submitted");
    await new Promise((r) => setTimeout(r, 1000));
    setTxProgress("pending");
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const changed = await checkFn();
        if (changed) {
          setTxProgress("confirmed");
          setTimeout(() => setTxProgress(null), 3000);
          return true;
        }
      } catch {
        // keep polling
      }
    }
    setTxProgress("confirmed");
    setTimeout(() => setTxProgress(null), 3000);
    return false;
  }

  async function handlePledge(e: React.FormEvent) {
    e.preventDefault();
    setPledgeError(null);
    setPledgeTxHash(null);

    if (!signer) {
      setPledgeError("Please connect your wallet first");
      return;
    }

    if (!campaign) return;

    const amount = parseFloat(pledgeAmount);
    if (isNaN(amount) || amount <= 0) {
      setPledgeError("Please enter a valid pledge amount");
      return;
    }

    setPledging(true);

    try {
      const address = await signer.getRecommendedAddress();
      const client = signer.client;
      const addressObj = await ccc.Address.fromString(address, client);
      const backerLockScript = addressObj.script;
      const backerLockHash = backerLockScript.hash();

      const amountShannons = ckbToShannons(amount);

      const campaignTxHash = campaign.txHash.startsWith("0x")
        ? campaign.txHash.slice(2)
        : campaign.txHash;
      const backerHash = backerLockHash.startsWith("0x")
        ? backerLockHash.slice(2)
        : backerLockHash;

      // Get campaign type script hash for pledge lock args
      const campaignTx = await client.getTransaction("0x" + campaignTxHash);
      const campaignTypeScript = ccc.Script.from(campaignTx!.transaction!.outputs[0].type!);
      const campaignTypeScriptHash = campaignTypeScript.hash();
      const campaignTypeHash = campaignTypeScriptHash.startsWith("0x")
        ? campaignTypeScriptHash.slice(2)
        : campaignTypeScriptHash;

      // Pledge cell data (72 bytes): campaign_id + backer_lock_hash + amount
      const pledgeData = "0x" + campaignTxHash + backerHash + u64ToHexLE(amountShannons);

      // Receipt cell data (40 bytes): pledge_amount + backer_lock_hash
      const receiptData = "0x" + u64ToHexLE(amountShannons) + backerHash;

      // Pledge lock args (72 bytes): campaign_type_script_hash + deadline_block + backer_lock_hash
      const deadlineBlock = BigInt(campaign.deadlineBlock);
      const pledgeLockArgs = "0x" + campaignTypeHash + u64ToHexLE(deadlineBlock) + backerHash;

      // Capacity calculations
      // Pledge cell: lock script with pledge-lock args (72 bytes) = code_hash(32) + hash_type(1) + args(72) = 105 bytes
      const pledgeLockSize = 105;
      const pledgeBaseCapacity = BigInt(Math.ceil((8 + PLEDGE_DATA_SIZE + 65 + pledgeLockSize) * 1.2)) * BigInt(100000000);
      const pledgeTotalCapacity = pledgeBaseCapacity + amountShannons;

      // Receipt cell: backer's lock (65 bytes) + receipt type script (65 bytes)
      const receiptCapacity = BigInt(Math.ceil((8 + RECEIPT_DATA_SIZE + 65 + 65) * 1.2)) * BigInt(100000000);

      const tx = ccc.Transaction.from({
        outputs: [
          {
            // Pledge cell with custom pledge lock
            capacity: pledgeTotalCapacity,
            lock: {
              codeHash: CONTRACTS.pledgeLock.codeHash,
              hashType: CONTRACTS.pledgeLock.hashType,
              args: pledgeLockArgs,
            },
            type: {
              codeHash: CONTRACTS.pledge.codeHash,
              hashType: CONTRACTS.pledge.hashType,
              args: CONTRACTS.receipt.codeHash,
            },
          },
          {
            // Receipt cell owned by backer
            capacity: receiptCapacity,
            lock: backerLockScript,
            type: {
              codeHash: CONTRACTS.receipt.codeHash,
              hashType: CONTRACTS.receipt.hashType,
              args: CONTRACTS.pledge.codeHash,
            },
          },
        ],
        outputsData: [pledgeData, receiptData],
        cellDeps: [
          {
            outPoint: {
              txHash: CONTRACTS.pledge.txHash,
              index: CONTRACTS.pledge.index,
            },
            depType: "code",
          },
          {
            outPoint: {
              txHash: CONTRACTS.pledgeLock.txHash,
              index: CONTRACTS.pledgeLock.index,
            },
            depType: "code",
          },
          {
            outPoint: {
              txHash: CONTRACTS.receipt.txHash,
              index: CONTRACTS.receipt.index,
            },
            depType: "code",
          },
          {
            // Campaign cell dep (for receipt type script validation)
            outPoint: {
              txHash: "0x" + campaignTxHash,
              index: 0,
            },
            depType: "code",
          },
        ],
      });

      await tx.completeInputsByCapacity(signer);
      await tx.completeFeeBy(signer, 1000);

      const hash = await signer.sendTransaction(tx);
      setPledgeTxHash(hash);
      setPledgeAmount("");
      toast("success", "Pledge submitted successfully!");

      // Poll until the new pledge appears
      const prevCount = pledges.length;
      await pollForChange(async () => {
        const newPledges = await fetchPledgesForCampaign(campaignId);
        if (newPledges.length > prevCount) {
          setPledges(newPledges);
          const newCampaign = await fetchCampaign(campaignId);
          if (newCampaign) setCampaign(newCampaign);
          return true;
        }
        return false;
      });
    } catch (err) {
      console.error("Failed to create pledge:", err);
      const msg = err instanceof Error ? err.message : "Failed to create pledge";
      if (msg.includes("rejected") || msg.includes("disconnected")) {
        toast("warning", "Transaction was cancelled");
      } else {
        setPledgeError(msg);
        toast("error", "Pledge failed");
      }
    } finally {
      setPledging(false);
    }
  }

  async function handleFinalize() {
    if (!signer || !campaign) return;
    setActionLoading(true);
    setActionTxHash(null);

    try {
      const totalPledged = BigInt(campaign.totalPledged);
      const fundingGoal = BigInt(campaign.fundingGoal);
      const newStatus = totalPledged >= fundingGoal ? CampaignStatus.Success : CampaignStatus.Failed;

      const creatorHash = campaign.creator.startsWith("0x") ? campaign.creator.slice(2) : campaign.creator;
      const fundingGoalHex = u64ToHexLE(fundingGoal);
      const deadlineBlockHex = u64ToHexLE(BigInt(campaign.deadlineBlock));
      const totalPledgedHex = u64ToHexLE(BigInt(0));
      const statusHex = newStatus.toString(16).padStart(2, "0");
      const reserved = "00".repeat(8);
      let campaignHex = creatorHash + fundingGoalHex + deadlineBlockHex + totalPledgedHex + statusHex + reserved;

      if (campaign.title || campaign.description) {
        campaignHex += serializeMetadataHex(campaign.title || "", campaign.description || "");
      }
      const newCampaignData = "0x" + campaignHex;

      const client = signer.client;

      const dataSize = campaignHex.length / 2;
      const capacity = BigInt(Math.ceil((8 + dataSize + 65 + 65) * 1.2)) * BigInt(100000000);

      const [txHash, indexStr] = campaign.campaignId.split("_");

      // Fetch original campaign cell to preserve TypeID args and lock script
      const campaignTx = await client.getTransaction(txHash);
      const originalOutput = campaignTx!.transaction!.outputs[parseInt(indexStr)];
      const typeIdArgs = originalOutput.type!.args;
      const originalLock = originalOutput.lock;

      // Use since field for campaign-lock deadline enforcement
      const deadlineBlock = BigInt(campaign.deadlineBlock);

      const tx = ccc.Transaction.from({
        inputs: [
          {
            previousOutput: {
              txHash: txHash,
              index: parseInt(indexStr),
            },
            since: deadlineBlock,
          },
        ],
        outputs: [
          {
            capacity,
            lock: originalLock,
            type: {
              codeHash: CONTRACTS.campaign.codeHash,
              hashType: CONTRACTS.campaign.hashType,
              args: typeIdArgs,
            },
          },
        ],
        outputsData: [newCampaignData],
        cellDeps: [
          {
            outPoint: {
              txHash: CONTRACTS.campaign.txHash,
              index: CONTRACTS.campaign.index,
            },
            depType: "code",
          },
          {
            outPoint: {
              txHash: CONTRACTS.campaignLock.txHash,
              index: CONTRACTS.campaignLock.index,
            },
            depType: "code",
          },
        ],
      });

      await tx.completeFeeBy(signer, 1000);
      const hash = await signer.sendTransaction(tx);
      setActionTxHash(hash);
      toast("success", "Campaign finalized! Redirecting...");

      // Poll until the finalized campaign appears
      const newCampaignId = hash + "_0";
      const maxAttempts = 20;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const found = await fetchCampaign(newCampaignId);
        if (found) {
          router.push(`/campaigns/${encodeURIComponent(newCampaignId)}`);
          return;
        }
      }
      router.push(`/campaigns/${encodeURIComponent(newCampaignId)}`);
    } catch (err) {
      console.error("Failed to finalize campaign:", err);
      const msg = err instanceof Error ? err.message : "Failed to finalize campaign";
      if (msg.includes("rejected") || msg.includes("disconnected")) {
        toast("warning", "Transaction was cancelled");
      } else {
        toast("error", msg);
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleTriggerRelease() {
    if (!signer || !campaign || receipts.length === 0) return;
    setActionLoading(true);
    setActionTxHash(null);

    try {
      const address = await signer.getRecommendedAddress();
      const client = signer.client;
      const addressObj = await ccc.Address.fromString(address, client);
      const signerLockHash = addressObj.script.hash();

      // Get creator's lock script from campaign
      const creatorLockScript = campaign.creatorLockScript || {
        codeHash: "",
        hashType: "",
        args: "",
      };

      // For each pledge (receipt), trigger a permissionless release transaction
      // For simplicity, we'll trigger for the first receipt to demonstrate
      // In production, you'd batch multiple or loop through
      const firstReceipt = receipts[0];

      // Parse the pledge cell from the receipt txHash
      const pledgeCell = pledges.find((p) =>
        p.txHash.toLowerCase() === firstReceipt.txHash.toLowerCase()
      );

      if (!pledgeCell) {
        toast("error", "Could not find pledge cell for receipt");
        return;
      }

      // Fetch actual pledge cell capacity from chain (includes base + pledge amount)
      const pledgeTxData = await client.getTransaction(pledgeCell.txHash);
      if (!pledgeTxData || !pledgeTxData.transaction) {
        toast("error", "Could not fetch pledge transaction from chain");
        return;
      }
      const pledgeCapacity = BigInt(pledgeTxData.transaction.outputs[pledgeCell.index]!.capacity);

      // Get campaign cell outpoint for deps
      const [campaignTxHash, campaignIndexStr] = campaign.campaignId.split("_");
      const campaignCellDep = {
        txHash: campaignTxHash,
        index: parseInt(campaignIndexStr),
      };

      // Build permissionless release transaction
      const tx = ccc.Transaction.from({
        inputs: [
          {
            previousOutput: {
              txHash: pledgeCell.txHash,
              index: pledgeCell.index,
            },
            since: campaign.deadlineBlock,
          },
        ],
        outputs: [
          {
            capacity: pledgeCapacity - BigInt(100000), // Deduct small fee
            lock: {
              codeHash: creatorLockScript.codeHash || "",
              hashType: (creatorLockScript.hashType || "type") as "type" | "data" | "data1" | "data2",
              args: creatorLockScript.args || "",
            },
          },
        ],
        outputsData: ["0x"],
        cellDeps: [
          {
            outPoint: campaignCellDep,
            depType: "code",
          },
          {
            outPoint: {
              txHash: CONTRACTS.pledgeLock.txHash,
              index: CONTRACTS.pledgeLock.index,
            },
            depType: "code",
          },
          {
            outPoint: {
              txHash: CONTRACTS.pledge.txHash,
              index: CONTRACTS.pledge.index,
            },
            depType: "code",
          },
        ],
      });

      await tx.completeFeeBy(signer, 1000);
      const hash = await signer.sendTransaction(tx);
      setActionTxHash(hash);
      toast("success", "Release triggered! Funds being sent to creator...");

      // Poll for receipt distribution update
      await pollForChange(async () => {
        const updatedReceipts = await fetchReceiptsForCampaign(campaignId).catch(() => [] as Receipt[]);
        setReceipts(updatedReceipts);
        return updatedReceipts.length > receiptCount;
      });
    } catch (err) {
      console.error("Failed to trigger release:", err);
      const msg = err instanceof Error ? err.message : "Failed to trigger release";
      if (msg.includes("rejected") || msg.includes("disconnected")) {
        toast("warning", "Transaction was cancelled");
      } else {
        toast("error", msg);
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleTriggerRefund() {
    if (!signer || !campaign || receipts.length === 0) return;
    setActionLoading(true);
    setActionTxHash(null);

    try {
      const address = await signer.getRecommendedAddress();
      const client = signer.client;
      const addressObj = await ccc.Address.fromString(address, client);
      const signerLockHash = addressObj.script.hash();

      // Get backer's lock script
      const backerLockScript = (await ccc.Address.fromString(address, client)).script;

      // For the first receipt/pledge pair, trigger permissionless refund
      const firstReceipt = receipts[0];

      // Find corresponding pledge
      const pledgeCell = pledges.find((p) =>
        p.txHash.toLowerCase() === firstReceipt.txHash.toLowerCase()
      );

      if (!pledgeCell) {
        toast("error", "Could not find pledge cell for receipt");
        return;
      }

      // Fetch actual cell capacities from chain
      const pledgeTxData = await client.getTransaction(pledgeCell.txHash);
      if (!pledgeTxData || !pledgeTxData.transaction) {
        toast("error", "Could not fetch pledge transaction from chain");
        return;
      }
      const pledgeCapacity = BigInt(pledgeTxData.transaction.outputs[pledgeCell.index]!.capacity);

      const receiptTxData = await client.getTransaction(firstReceipt.txHash);
      if (!receiptTxData || !receiptTxData.transaction) {
        toast("error", "Could not fetch receipt transaction from chain");
        return;
      }
      const receiptCapacity = BigInt(receiptTxData.transaction.outputs[firstReceipt.index]!.capacity);

      // Get campaign cell outpoint
      const [campaignTxHash, campaignIndexStr] = campaign.campaignId.split("_");
      const campaignCellDep = {
        txHash: campaignTxHash,
        index: parseInt(campaignIndexStr),
      };

      // Build permissionless refund transaction
      const tx = ccc.Transaction.from({
        inputs: [
          {
            previousOutput: {
              txHash: pledgeCell.txHash,
              index: pledgeCell.index,
            },
            since: campaign.deadlineBlock,
          },
          {
            previousOutput: {
              txHash: firstReceipt.txHash,
              index: firstReceipt.index,
            },
          },
        ],
        outputs: [
          {
            capacity: pledgeCapacity + receiptCapacity - BigInt(100000), // Pledge + receipt - fee
            lock: backerLockScript,
          },
        ],
        outputsData: ["0x"],
        cellDeps: [
          {
            outPoint: {
              txHash: CONTRACTS.pledgeLock.txHash,
              index: CONTRACTS.pledgeLock.index,
            },
            depType: "code",
          },
          {
            outPoint: {
              txHash: CONTRACTS.pledge.txHash,
              index: CONTRACTS.pledge.index,
            },
            depType: "code",
          },
          {
            outPoint: {
              txHash: CONTRACTS.receipt.txHash,
              index: CONTRACTS.receipt.index,
            },
            depType: "code",
          },
        ],
      });

      await tx.completeFeeBy(signer, 1000);
      const hash = await signer.sendTransaction(tx);
      setActionTxHash(hash);
      toast("success", "Refund triggered! Funds being returned to backers...");

      // Poll for receipt/pledge update
      await pollForChange(async () => {
        const updatedReceipts = await fetchReceiptsForCampaign(campaignId).catch(() => [] as Receipt[]);
        const updatedPledges = await fetchPledgesForCampaign(campaignId);
        setReceipts(updatedReceipts);
        setPledges(updatedPledges);
        return updatedPledges.length < pledges.length;
      });
    } catch (err) {
      console.error("Failed to trigger refund:", err);
      const msg = err instanceof Error ? err.message : "Failed to trigger refund";
      if (msg.includes("rejected") || msg.includes("disconnected")) {
        toast("warning", "Transaction was cancelled");
      } else {
        toast("error", msg);
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDestroy() {
    if (!signer || !campaign) return;
    setActionLoading(true);
    setActionTxHash(null);

    try {
      const address = await signer.getRecommendedAddress();
      const client = signer.client;
      const lockScript = (await ccc.Address.fromString(address, client)).script;

      const [txHash, indexStr] = campaign.campaignId.split("_");

      // Calculate campaign cell capacity (same formula as creation)
      const campaignHexLen = campaign.title || campaign.description
        ? 65 + 2 + new TextEncoder().encode(campaign.title || "").length + 2 + new TextEncoder().encode(campaign.description || "").length
        : 65;
      const campaignCapacity = BigInt(Math.ceil((8 + campaignHexLen + 65 + 65) * 1.2)) * BigInt(100000000);

      const tx = ccc.Transaction.from({
        inputs: [
          {
            previousOutput: {
              txHash: txHash,
              index: parseInt(indexStr),
            },
          },
        ],
        outputs: [
          {
            capacity: campaignCapacity,
            lock: lockScript,
            // No type script — plain CKB cell, capacity reclaimed
          },
        ],
        outputsData: ["0x"],
        cellDeps: [
          {
            outPoint: {
              txHash: CONTRACTS.campaign.txHash,
              index: CONTRACTS.campaign.index,
            },
            depType: "code",
          },
        ],
      });

      await tx.completeFeeBy(signer, 1000);
      const hash = await signer.sendTransaction(tx);
      setActionTxHash(hash);
      toast("success", "Campaign destroyed! Redirecting...");

      // Poll until campaign disappears from indexer, then redirect
      await pollForChange(async () => {
        const found = await fetchCampaign(campaignId);
        if (!found) return true;
        return false;
      });
      router.push("/");
    } catch (err) {
      console.error("Failed to destroy campaign:", err);
      const msg = err instanceof Error ? err.message : "Failed to destroy campaign";
      if (msg.includes("rejected") || msg.includes("disconnected")) {
        toast("warning", "Transaction was cancelled");
      } else {
        toast("error", msg);
      }
    } finally {
      setActionLoading(false);
    }
  }

  function copyCampaignId() {
    navigator.clipboard.writeText(campaign?.campaignId || "");
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), 2000);
  }

  // Sort pledges
  const sortedPledges = [...pledges].sort((a, b) => {
    if (pledgeSortMode === "amount") {
      return Number(BigInt(b.amount) - BigInt(a.amount));
    }
    // recent: by createdAt block descending
    return Number(BigInt(b.createdAt) - BigInt(a.createdAt));
  });

  if (loading) {
    return <SkeletonDetailPage />;
  }

  if (error || !campaign) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">
            {error || "Campaign not found"}
          </p>
        </div>
        <Link
          href="/"
          className="inline-block mt-4 text-blue-600 hover:underline"
        >
          Back to campaigns
        </Link>
      </div>
    );
  }

  const progress = getFundingProgress(campaign.totalPledged, campaign.fundingGoal);
  const isExpired = currentBlock !== null && BigInt(campaign.deadlineBlock) < currentBlock;
  const canPledge = campaign.status === CampaignStatus.Active && !isExpired;
  const isCreator = walletLockHash !== null && campaign.creator.toLowerCase() === walletLockHash.toLowerCase();
  const needsFinalization = campaign.status === CampaignStatus.Active && isExpired;
  const canFinalize = needsFinalization && campaign.status === CampaignStatus.Active;
  const effectiveStatus = campaign.effectiveStatus || (
    campaign.status === CampaignStatus.Active
      ? (isExpired
        ? (BigInt(campaign.totalPledged) >= BigInt(campaign.fundingGoal) ? "expired_success" : "expired_failed")
        : "active")
      : campaign.status === CampaignStatus.Success ? "success" : "failed"
  );
  const blocksRemaining = currentBlock !== null
    ? BigInt(campaign.deadlineBlock) - currentBlock
    : null;
  const backerCount = campaign?.backerCount ?? 0;

  /** Derive distribution counts from receipts and live pledges */
  const receiptCount = receipts.length;
  const livePledgeCount = pledges.length;
  const distributedCount = Math.max(0, receiptCount - livePledgeCount);
  const releasedCount = (campaign?.status === CampaignStatus.Success) ? distributedCount : 0;
  const refundedCount = (campaign?.status === CampaignStatus.Failed) ? distributedCount : 0;

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        href="/"
        className="inline-block mb-6 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        &larr; Back to campaigns
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Pledge Form Sidebar — appears first on mobile */}
        <div className="lg:col-span-1 order-first lg:order-last">
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 sticky top-8">
            <h2 className="text-lg font-semibold mb-4">Make a Pledge</h2>

            {!canPledge ? (
              <div className="bg-zinc-100 dark:bg-zinc-900 rounded-lg p-4 text-center">
                <p className="text-zinc-600 dark:text-zinc-400">
                  {isExpired
                    ? "This campaign has expired"
                    : "This campaign is no longer accepting pledges"}
                </p>
              </div>
            ) : !signer ? (
              <div className="text-center">
                <p className="text-zinc-600 dark:text-zinc-400 mb-4">
                  Connect your wallet to make a pledge
                </p>
                <button
                  onClick={open}
                  className="w-full px-4 py-2 font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 min-h-[44px]"
                >
                  Connect Wallet
                </button>
              </div>
            ) : (
              <form onSubmit={handlePledge} className="space-y-4">
                <div>
                  <label
                    htmlFor="pledgeAmount"
                    className="block text-sm font-medium mb-2"
                  >
                    Amount (CKB)
                  </label>
                  <input
                    type="number"
                    id="pledgeAmount"
                    value={pledgeAmount}
                    onChange={(e) => setPledgeAmount(e.target.value)}
                    placeholder="100"
                    min="1"
                    step="1"
                    className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={pledging}
                  />
                </div>

                {pledgeAmount && (
                  <div className="mt-3 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Cost Breakdown</div>
                    {(() => {
                      const breakdown = calculateCostBreakdown(pledgeAmount);
                      return (
                        <div className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                          <div className="flex justify-between">
                            <span>Pledge amount:</span>
                            <span className="font-medium">{formatCost(breakdown.pledgeAmount)} CKB</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Pledge cell capacity:</span>
                            <span className="font-medium">{formatCost(breakdown.pledgeCellCapacity)} CKB</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Receipt cell capacity:</span>
                            <span className="font-medium">{formatCost(breakdown.receiptCellCapacity)} CKB</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Estimated tx fee:</span>
                            <span className="font-medium">{formatCost(breakdown.estimatedFee)} CKB</span>
                          </div>
                          <div className="border-t border-zinc-300 dark:border-zinc-700 my-2 pt-2 flex justify-between font-semibold text-zinc-800 dark:text-zinc-200">
                            <span>Total cost:</span>
                            <span>{formatCost(breakdown.totalCost)} CKB</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {pledgeError && (
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <p className="text-sm text-red-800 dark:text-red-200">
                      {pledgeError}
                    </p>
                  </div>
                )}

                {pledgeTxHash && (
                  <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
                    <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                      Pledge submitted!
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-300 font-mono mt-1 break-all">
                      TX: {formatHash(pledgeTxHash, 12)}
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={pledging}
                  className="w-full px-4 py-3 font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                >
                  {pledging ? "Submitting..." : "Pledge"}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Campaign Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0">
                {campaign.title ? (
                  <h2 className="text-2xl font-bold">{campaign.title}</h2>
                ) : (
                  <>
                    <p className="text-sm text-zinc-500 mb-1">Campaign ID</p>
                    <p className="font-mono text-sm break-all">{campaign.campaignId}</p>
                  </>
                )}
              </div>
              <span
                className={`px-3 py-1 text-sm font-medium rounded whitespace-nowrap ml-2 ${getEffectiveStatusColor(effectiveStatus)}`}
              >
                {getEffectiveStatusLabel(effectiveStatus)}
              </span>
            </div>

            {/* Collapsible Campaign ID */}
            {campaign.title && (
              <div className="mb-4">
                <button
                  onClick={() => setShowCampaignId(!showCampaignId)}
                  className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 flex items-center gap-1"
                >
                  <span>{showCampaignId ? "Hide" : "Show"} Campaign ID</span>
                  <span>{showCampaignId ? "\u25B2" : "\u25BC"}</span>
                </button>
                {showCampaignId && (
                  <div className="mt-1 flex items-center gap-2">
                    <p className="font-mono text-xs text-zinc-500 break-all flex-1">
                      {campaign.campaignId}
                    </p>
                    <button
                      onClick={copyCampaignId}
                      className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap"
                    >
                      {idCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {campaign.description && (
              <p className="text-zinc-600 dark:text-zinc-400 mb-4">
                {campaign.description}
              </p>
            )}

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Funding Progress
                  </span>
                  <span className="font-medium">{progress.toFixed(1)}%</span>
                </div>
                <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all"
                    style={{ width: `${Math.min(100, progress)}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
                  <p className="text-sm text-zinc-500 mb-1">Pledged</p>
                  <p className="text-2xl font-bold">
                    {shannonsToCKB(campaign.totalPledged)} CKB
                  </p>
                </div>
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
                  <p className="text-sm text-zinc-500 mb-1">Goal</p>
                  <p className="text-2xl font-bold">
                    {shannonsToCKB(campaign.fundingGoal)} CKB
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-zinc-500">Deadline Block</p>
                  <p className="font-medium">
                    #{campaign.deadlineBlock}
                    {blocksRemaining !== null && (
                      <span className="text-zinc-500 ml-1 text-xs">
                        ({blocksRemaining > 0n
                          ? blocksToTimeEstimate(blocksRemaining) + " left"
                          : "Expired"})
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">Current Block</p>
                  <p className="font-medium">
                    #{currentBlock?.toString() || "..."}
                    {isExpired && (
                      <span className="ml-2 text-red-600">(Expired)</span>
                    )}
                  </p>
                </div>
              </div>

              {campaign.createdAt && currentBlock !== null && (
                <div className="text-sm">
                  <p className="text-zinc-500">Created at block</p>
                  <p className="font-medium">
                    #{campaign.createdAt}
                    <span className="text-zinc-500 ml-1 text-xs">
                      ({blockToRelativeTime(campaign.createdAt, currentBlock)})
                    </span>
                  </p>
                </div>
              )}

              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <p className="text-sm text-zinc-500 mb-1">Creator</p>
                <p className="font-mono text-sm break-all">{campaign.creator}</p>
              </div>

              <div>
                <p className="text-sm text-zinc-500 mb-1">Transaction</p>
                <p className="font-mono text-sm break-all">{campaign.txHash}</p>
              </div>
            </div>
          </div>

          {/* Transaction Progress Indicator */}
          {txProgress && (
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
              <div className="flex items-center gap-3">
                {["submitted", "pending", "confirmed"].map((step, i) => (
                  <div key={step} className="flex items-center gap-2">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        (step === "submitted" && txProgress) ||
                        (step === "pending" && (txProgress === "pending" || txProgress === "confirmed")) ||
                        (step === "confirmed" && txProgress === "confirmed")
                          ? "bg-blue-600"
                          : "bg-zinc-300 dark:bg-zinc-700"
                      }`}
                    />
                    <span className="text-xs text-zinc-600 dark:text-zinc-400 capitalize">
                      {step}
                    </span>
                    {i < 2 && (
                      <div className="w-8 h-px bg-zinc-300 dark:bg-zinc-700" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Distribution Status (v1.1) */}
          {campaign.status !== CampaignStatus.Active && (
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-2">Distribution Status</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {getDistributionSummary(receiptCount, releasedCount, refundedCount, effectiveStatus)}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                v1.1: Fund distribution is automatic and permissionless. Anyone can trigger release/refund transactions.
              </p>

              {signer && pledges.length > 0 && (
                <div className="mt-4 space-y-2">
                  {campaign.status === CampaignStatus.Success && (
                    <button
                      onClick={handleTriggerRelease}
                      disabled={actionLoading}
                      className="w-full px-4 py-3 font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                    >
                      {actionLoading ? "Triggering Release..." : "Trigger Release"}
                    </button>
                  )}

                  {campaign.status === CampaignStatus.Failed && (
                    <button
                      onClick={handleTriggerRefund}
                      disabled={actionLoading}
                      className="w-full px-4 py-3 font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                    >
                      {actionLoading ? "Triggering Refund..." : "Trigger Refund"}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Actions Section */}
          {signer && (canFinalize || (isCreator && campaign.status !== CampaignStatus.Active && pledges.length === 0)) && (
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Actions</h2>

              {actionTxHash && (
                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 mb-4">
                  <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                    Transaction submitted!
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300 font-mono mt-1 break-all">
                    TX: {formatHash(actionTxHash, 12)}
                  </p>
                </div>
              )}

              {canFinalize && (
                <div className="mb-4">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                    This campaign has expired and needs to be finalized on-chain.
                    {BigInt(campaign.totalPledged) >= BigInt(campaign.fundingGoal)
                      ? " The funding goal was met — it will be marked as Successful. Funds will be automatically released to the creator."
                      : " The funding goal was not met — it will be marked as Failed. Funds will be automatically refunded to backers."}
                  </p>
                  <button
                    onClick={handleFinalize}
                    disabled={actionLoading}
                    className="w-full px-4 py-3 font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                  >
                    {actionLoading ? "Finalizing..." : "Finalize Campaign"}
                  </button>
                </div>
              )}

              {isCreator && campaign.status !== CampaignStatus.Active && pledges.length === 0 && (
                <div className="mt-4">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                    All pledges have been handled. You can destroy this campaign cell to reclaim its CKB capacity.
                  </p>
                  <button
                    onClick={handleDestroy}
                    disabled={actionLoading}
                    className="w-full px-4 py-3 font-medium rounded-lg bg-zinc-600 text-white hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                  >
                    {actionLoading ? "Destroying..." : "Destroy Campaign & Reclaim CKB"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Pledges List */}
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                Pledges ({pledges.length}){" "}
                {backerCount > 0 && (
                  <span className="text-sm font-normal text-zinc-500">
                    from {backerCount} backer{backerCount !== 1 ? "s" : ""}
                  </span>
                )}
              </h2>
              {pledges.length > 1 && (
                <div className="flex items-center gap-1 text-xs">
                  <button
                    onClick={() => setPledgeSortMode("recent")}
                    className={`px-2 py-1 rounded ${
                      pledgeSortMode === "recent"
                        ? "bg-zinc-200 dark:bg-zinc-700 font-medium"
                        : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    }`}
                  >
                    Recent
                  </button>
                  <button
                    onClick={() => setPledgeSortMode("amount")}
                    className={`px-2 py-1 rounded ${
                      pledgeSortMode === "amount"
                        ? "bg-zinc-200 dark:bg-zinc-700 font-medium"
                        : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    }`}
                  >
                    Amount
                  </button>
                </div>
              )}
            </div>

            {pledges.length === 0 ? (
              <p className="text-zinc-500 text-center py-4">
                No pledges yet. Be the first to support this campaign!
              </p>
            ) : (
              <div className="space-y-3">
                {sortedPledges.map((pledge) => {
                  const receipt = receipts.find(
                    (r) => r.txHash.toLowerCase() === pledge.txHash.toLowerCase()
                  );
                  return (
                    <div
                      key={pledge.pledgeId}
                      className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-sm truncate">
                            {formatHash(pledge.backer)}
                          </p>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${getPledgeDistributionColor("locked")}`}>
                            {getPledgeDistributionLabel("locked")}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500">
                          Block #{pledge.createdAt}
                          {currentBlock !== null && (
                            <span className="ml-1">
                              ({blockToRelativeTime(pledge.createdAt, currentBlock)})
                            </span>
                          )}
                        </p>
                        {receipt && (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-zinc-500">
                              Receipt: {shannonsToCKB(receipt.pledgeAmount)} CKB
                            </span>
                            {EXPLORER_URL && (
                              <a
                                href={getExplorerTxUrl(EXPLORER_URL, receipt.txHash)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline"
                              >
                                View on Explorer
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                      <p className="font-medium whitespace-nowrap ml-2">
                        {shannonsToCKB(pledge.amount)} CKB
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
