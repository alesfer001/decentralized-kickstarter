"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ccc } from "@ckb-ccc/connector-react";
import { Campaign, Pledge, CampaignStatus } from "@/lib/types";
import { fetchCampaign, fetchPledgesForCampaign, fetchBlockNumber, fetchBackerPledges } from "@/lib/api";
import {
  shannonsToCKB,
  ckbToShannons,
  formatHash,
  getEffectiveStatusLabel,
  getEffectiveStatusColor,
  getFundingProgress,
  blocksToTimeEstimate,
  blockToRelativeTime,
  getUniqueBackerCount,
} from "@/lib/utils";
import { CONTRACTS, PLEDGE_DATA_SIZE, DEVNET_ACCOUNTS } from "@/lib/constants";
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
  const [userPledges, setUserPledges] = useState<Pledge[]>([]);

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
        setUserPledges([]);
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

  // Fetch user pledges when wallet lock hash or campaign changes
  useEffect(() => {
    if (!walletLockHash || !campaign) {
      setUserPledges([]);
      return;
    }
    const myPledges = pledges.filter(
      (p) => p.backer.toLowerCase() === walletLockHash.toLowerCase()
    );
    setUserPledges(myPledges);
  }, [walletLockHash, pledges, campaign]);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    if (!isRefresh) setError(null);

    try {
      const [campaignData, pledgesData, blockNum] = await Promise.all([
        fetchCampaign(campaignId),
        fetchPledgesForCampaign(campaignId),
        fetchBlockNumber(),
      ]);

      if (!campaignData) {
        if (!isRefresh) setError("Campaign not found");
      } else {
        setCampaign(campaignData);
        setPledges(pledgesData);
        setCurrentBlock(blockNum);
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
      const backerLockHash = addressObj.script.hash();

      const amountShannons = ckbToShannons(amount);

      const campaignTxHash = campaign.txHash.startsWith("0x")
        ? campaign.txHash.slice(2)
        : campaign.txHash;
      const backerHash = backerLockHash.startsWith("0x")
        ? backerLockHash.slice(2)
        : backerLockHash;

      const pledgeData = "0x" + campaignTxHash + backerHash + u64ToHexLE(amountShannons);

      const baseCapacity = BigInt(Math.ceil((8 + PLEDGE_DATA_SIZE + 65 + 65) * 1.2)) * BigInt(100000000);
      const totalCapacity = baseCapacity + amountShannons;

      const lockScript = addressObj.script;

      const tx = ccc.Transaction.from({
        outputs: [
          {
            capacity: totalCapacity,
            lock: lockScript,
            type: {
              codeHash: CONTRACTS.pledge.codeHash,
              hashType: CONTRACTS.pledge.hashType,
              args: "0x",
            },
          },
        ],
        outputsData: [pledgeData],
        cellDeps: CONTRACTS.pledge.txHash
          ? [
              {
                outPoint: {
                  txHash: CONTRACTS.pledge.txHash,
                  index: CONTRACTS.pledge.index,
                },
                depType: "code",
              },
            ]
          : [],
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

      const address = await signer.getRecommendedAddress();
      const client = signer.client;
      const lockScript = (await ccc.Address.fromString(address, client)).script;

      const dataSize = campaignHex.length / 2;
      const capacity = BigInt(Math.ceil((8 + dataSize + 65 + 65) * 1.2)) * BigInt(100000000);

      const [txHash, indexStr] = campaign.campaignId.split("_");

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
            capacity,
            lock: lockScript,
            type: {
              codeHash: CONTRACTS.campaign.codeHash,
              hashType: CONTRACTS.campaign.hashType,
              args: "0x",
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

  async function handleRefund(pledge: Pledge) {
    if (!signer) return;
    setActionLoading(true);
    setActionTxHash(null);

    try {
      const address = await signer.getRecommendedAddress();
      const client = signer.client;
      const lockScript = (await ccc.Address.fromString(address, client)).script;

      const [txHash, indexStr] = pledge.pledgeId.split("_");

      const pledgeCapacity = BigInt(Math.ceil((8 + PLEDGE_DATA_SIZE + 65 + 65) * 1.2)) * BigInt(100000000) + BigInt(pledge.amount);

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
            capacity: pledgeCapacity,
            lock: lockScript,
          },
        ],
        outputsData: ["0x"],
        cellDeps: [
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
      toast("success", "Refund submitted!");

      // Poll until the pledge disappears
      const pledgeId = pledge.pledgeId;
      await pollForChange(async () => {
        const newPledges = await fetchPledgesForCampaign(campaignId);
        if (!newPledges.find((p) => p.pledgeId === pledgeId)) {
          setPledges(newPledges);
          return true;
        }
        return false;
      });
    } catch (err) {
      console.error("Failed to refund pledge:", err);
      const msg = err instanceof Error ? err.message : "Failed to refund pledge";
      if (msg.includes("rejected") || msg.includes("disconnected")) {
        toast("warning", "Transaction was cancelled");
      } else {
        toast("error", msg);
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRelease(pledge: Pledge) {
    if (!signer || !campaign) return;
    setActionLoading(true);
    setActionTxHash(null);

    try {
      const client = signer.client;
      const creatorLockScript = await getCreatorLockScript(campaign.creator, client);

      const [txHash, indexStr] = pledge.pledgeId.split("_");

      const pledgeCapacity = BigInt(Math.ceil((8 + PLEDGE_DATA_SIZE + 65 + 65) * 1.2)) * BigInt(100000000) + BigInt(pledge.amount);

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
            capacity: pledgeCapacity,
            lock: creatorLockScript,
          },
        ],
        outputsData: ["0x"],
        cellDeps: [
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
      toast("success", "Release submitted!");

      // Poll until the pledge disappears
      const pledgeId = pledge.pledgeId;
      await pollForChange(async () => {
        const newPledges = await fetchPledgesForCampaign(campaignId);
        if (!newPledges.find((p) => p.pledgeId === pledgeId)) {
          setPledges(newPledges);
          return true;
        }
        return false;
      });
    } catch (err) {
      console.error("Failed to release pledge:", err);
      const msg = err instanceof Error ? err.message : "Failed to release pledge to creator";
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
  const effectiveStatus = campaign.effectiveStatus || (
    campaign.status === CampaignStatus.Active
      ? (isExpired
        ? (BigInt(campaign.totalPledged) >= BigInt(campaign.fundingGoal) ? "expired_success" : "expired_failed")
        : "active")
      : campaign.status === CampaignStatus.Success ? "success" : "failed"
  );
  const isFailed = effectiveStatus === "failed" || effectiveStatus === "expired_failed";
  const isSuccess = effectiveStatus === "success" || effectiveStatus === "expired_success";
  const blocksRemaining = currentBlock !== null
    ? BigInt(campaign.deadlineBlock) - currentBlock
    : null;
  const backerCount = getUniqueBackerCount(pledges);

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

          {/* Actions Section */}
          {signer && (needsFinalization || userPledges.length > 0 || (isCreator && campaign.status !== CampaignStatus.Active && pledges.length === 0)) && (
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

              {needsFinalization && isCreator && (
                <div className="mb-4">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                    This campaign has expired and needs to be finalized on-chain.
                    {BigInt(campaign.totalPledged) >= BigInt(campaign.fundingGoal)
                      ? " The funding goal was met -- it will be marked as Successful."
                      : " The funding goal was not met -- it will be marked as Failed."}
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

              {userPledges.length > 0 && (isFailed || isSuccess) && (
                <div>
                  <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-3">
                    Your Pledges
                  </h3>
                  <div className="space-y-3">
                    {userPledges.map((pledge) => (
                      <div
                        key={pledge.pledgeId}
                        className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg"
                      >
                        <div>
                          <p className="font-medium">
                            {shannonsToCKB(pledge.amount)} CKB
                          </p>
                          <p className="text-xs text-zinc-500 font-mono">
                            {formatHash(pledge.txHash)}
                          </p>
                        </div>
                        {isFailed && campaign.status !== CampaignStatus.Active && (
                          <button
                            onClick={() => handleRefund(pledge)}
                            disabled={actionLoading}
                            className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                          >
                            {actionLoading ? "..." : "Claim Refund"}
                          </button>
                        )}
                        {isSuccess && campaign.status !== CampaignStatus.Active && (
                          <button
                            onClick={() => handleRelease(pledge)}
                            disabled={actionLoading}
                            className="px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                          >
                            {actionLoading ? "..." : "Release to Creator"}
                          </button>
                        )}
                        {campaign.status === CampaignStatus.Active && needsFinalization && (
                          <span className="text-xs text-zinc-500">
                            Finalize campaign first
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
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
                {sortedPledges.map((pledge) => (
                  <div
                    key={pledge.pledgeId}
                    className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg"
                  >
                    <div>
                      <p className="font-mono text-sm">
                        {formatHash(pledge.backer)}
                      </p>
                      <p className="text-xs text-zinc-500">
                        Block #{pledge.createdAt}
                        {currentBlock !== null && (
                          <span className="ml-1">
                            ({blockToRelativeTime(pledge.createdAt, currentBlock)})
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="font-medium">
                      {shannonsToCKB(pledge.amount)} CKB
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Get creator lock args by matching lock hash against known devnet accounts
async function getCreatorLockScript(
  creatorLockHash: string,
  client: any
): Promise<{ codeHash: string; hashType: "type"; args: string }> {
  for (const account of DEVNET_ACCOUNTS) {
    try {
      const addressObj = await ccc.Address.fromString(account.address, client);
      const hash = addressObj.script.hash();
      if (hash.toLowerCase() === creatorLockHash.toLowerCase()) {
        return {
          codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
          hashType: "type",
          args: account.lockArg,
        };
      }
    } catch {
      continue;
    }
  }
  throw new Error("Creator not found in known devnet accounts. Cannot construct lock script.");
}
