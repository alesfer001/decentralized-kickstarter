"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ccc } from "@ckb-ccc/connector-react";
import { ckbToShannons } from "@/lib/utils";
import { CONTRACTS, CAMPAIGN_DATA_SIZE } from "@/lib/constants";
import { u64ToHexLE, serializeMetadataHex } from "@/lib/serialization";
import { useDevnet } from "@/components/DevnetContext";
import { useToast } from "@/components/Toast";
import { fetchBlockNumber, fetchCampaign } from "@/lib/api";

export default function CreateCampaignPage() {
  const router = useRouter();
  const { open } = ccc.useCcc();
  const walletSigner = ccc.useSigner();
  const { isDevnet, devnetSigner } = useDevnet();
  const { toast } = useToast();

  const signer = isDevnet ? devnetSigner : walletSigner;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fundingGoal, setFundingGoal] = useState("");
  const [deadlineBlocks, setDeadlineBlocks] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentBlock, setCurrentBlock] = useState<bigint | null>(null);

  // Field-level validation errors
  const [titleError, setTitleError] = useState<string | null>(null);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [deadlineError, setDeadlineError] = useState<string | null>(null);

  // Fetch current block on mount
  useEffect(() => {
    fetchBlockNumber()
      .then(setCurrentBlock)
      .catch(() => {});
  }, []);

  function validateTitle(): boolean {
    if (!title.trim()) {
      setTitleError("Title is required");
      return false;
    }
    setTitleError(null);
    return true;
  }

  function validateGoal(): boolean {
    const goal = parseFloat(fundingGoal);
    if (isNaN(goal) || goal <= 0) {
      setGoalError("Please enter a valid funding goal");
      return false;
    }
    if (goal < 100) {
      setGoalError("Funding goal must be at least 100 CKB");
      return false;
    }
    setGoalError(null);
    return true;
  }

  function validateDeadline(): boolean {
    const deadline = parseInt(deadlineBlocks);
    if (isNaN(deadline) || deadline <= 0) {
      setDeadlineError("Please enter a valid deadline block number");
      return false;
    }
    if (currentBlock !== null && BigInt(deadline) <= currentBlock) {
      setDeadlineError("Deadline must be greater than the current block");
      return false;
    }
    setDeadlineError(null);
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!signer) {
      toast("warning", "Please connect your wallet first");
      return;
    }

    // Validate all fields
    const titleValid = validateTitle();
    const goalValid = validateGoal();
    const deadlineValid = validateDeadline();
    if (!titleValid || !goalValid || !deadlineValid) return;

    const goal = parseFloat(fundingGoal);
    const deadline = parseInt(deadlineBlocks);

    setLoading(true);

    try {
      const address = await signer.getRecommendedAddress();
      const client = signer.client;
      const addressObj = await ccc.Address.fromString(address, client);
      const creatorLockHash = addressObj.script.hash();

      const fundingGoalShannons = ckbToShannons(goal);
      const deadlineBlock = BigInt(deadline);

      const creatorHash = creatorLockHash.startsWith("0x")
        ? creatorLockHash.slice(2)
        : creatorLockHash;

      let campaignHex =
        creatorHash +
        u64ToHexLE(fundingGoalShannons) +
        u64ToHexLE(deadlineBlock) +
        u64ToHexLE(BigInt(0)) +
        "00" +
        "00".repeat(8);

      if (title.trim() || description.trim()) {
        campaignHex += serializeMetadataHex(title.trim(), description.trim());
      }

      const campaignData = "0x" + campaignHex;

      const dataSize = campaignHex.length / 2;
      const capacity = BigInt(Math.ceil((8 + dataSize + 65 + 65) * 1.2)) * BigInt(100000000);

      const lockScript = addressObj.script;

      const tx = ccc.Transaction.from({
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
        outputsData: [campaignData],
        cellDeps: CONTRACTS.campaign.txHash
          ? [
              {
                outPoint: {
                  txHash: CONTRACTS.campaign.txHash,
                  index: CONTRACTS.campaign.index,
                },
                depType: "code",
              },
            ]
          : [],
      });

      await tx.completeInputsByCapacity(signer);
      await tx.completeFeeBy(signer, 1000);

      const hash = await signer.sendTransaction(tx);
      toast("success", "Campaign created successfully!");

      // Poll indexer until the new campaign appears, then redirect
      const newCampaignId = hash + "_0";
      const maxAttempts = 20;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const found = await fetchCampaign(newCampaignId);
          if (found) {
            router.push(`/campaigns/${encodeURIComponent(newCampaignId)}`);
            return;
          }
        } catch {
          // keep polling
        }
      }
      // Timeout — redirect to home
      router.push("/");
    } catch (err) {
      console.error("Failed to create campaign:", err);
      const msg = err instanceof Error ? err.message : "Failed to create campaign";
      if (msg.includes("rejected") || msg.includes("disconnected")) {
        toast("warning", "Transaction was cancelled");
      } else {
        toast("error", msg);
      }
    } finally {
      setLoading(false);
    }
  }

  const titleLen = new TextEncoder().encode(title).length;
  const descLen = new TextEncoder().encode(description).length;

  return (
    <div className="max-w-lg mx-auto px-2 sm:px-0">
      <h1 className="text-3xl font-bold mb-2">Create Campaign</h1>
      <p className="text-zinc-600 dark:text-zinc-400 mb-8">
        Start a new crowdfunding campaign on CKB
      </p>

      {!signer && (
        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
          <p className="text-yellow-800 dark:text-yellow-200 mb-3">
            Connect your wallet to create a campaign
          </p>
          <button
            onClick={open}
            className="px-4 py-2 font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 min-h-[44px]"
          >
            Connect Wallet
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label
            htmlFor="title"
            className="block text-sm font-medium mb-2"
          >
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (titleError) setTitleError(null);
            }}
            onBlur={validateTitle}
            placeholder="My Awesome Project"
            maxLength={200}
            className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              titleError
                ? "border-red-400 dark:border-red-600"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
            disabled={loading}
          />
          <div className="flex justify-between mt-1">
            {titleError ? (
              <p className="text-sm text-red-600 dark:text-red-400">{titleError}</p>
            ) : (
              <p className="text-sm text-zinc-500">Give your campaign a memorable name</p>
            )}
            <span
              className={`text-xs ${
                titleLen > 180
                  ? "text-orange-500"
                  : "text-zinc-400"
              }`}
            >
              {titleLen}/200
            </span>
          </div>
        </div>

        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium mb-2"
          >
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your project and what you plan to achieve..."
            maxLength={2000}
            rows={4}
            className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical"
            disabled={loading}
          />
          <div className="flex justify-between mt-1">
            <p className="text-sm text-zinc-500">Tell backers about your project (stored on-chain)</p>
            <span
              className={`text-xs ${
                descLen > 1800
                  ? "text-orange-500"
                  : "text-zinc-400"
              }`}
            >
              {descLen}/2000
            </span>
          </div>
        </div>

        <div>
          <label
            htmlFor="fundingGoal"
            className="block text-sm font-medium mb-2"
          >
            Funding Goal (CKB)
          </label>
          <input
            type="number"
            id="fundingGoal"
            value={fundingGoal}
            onChange={(e) => {
              setFundingGoal(e.target.value);
              if (goalError) setGoalError(null);
            }}
            onBlur={validateGoal}
            placeholder="1000"
            min="100"
            step="1"
            className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              goalError
                ? "border-red-400 dark:border-red-600"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
            disabled={loading}
          />
          <div className="mt-1">
            {goalError ? (
              <p className="text-sm text-red-600 dark:text-red-400">{goalError}</p>
            ) : (
              <p className="text-sm text-zinc-500">
                Minimum 100 CKB due to cell capacity requirements
              </p>
            )}
          </div>
        </div>

        <div>
          <label
            htmlFor="deadlineBlocks"
            className="block text-sm font-medium mb-2"
          >
            Deadline (block number)
          </label>
          <input
            type="number"
            id="deadlineBlocks"
            value={deadlineBlocks}
            onChange={(e) => {
              setDeadlineBlocks(e.target.value);
              if (deadlineError) setDeadlineError(null);
            }}
            onBlur={validateDeadline}
            placeholder="100000"
            min="1"
            step="1"
            className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              deadlineError
                ? "border-red-400 dark:border-red-600"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
            disabled={loading}
          />
          <div className="mt-1">
            {deadlineError ? (
              <p className="text-sm text-red-600 dark:text-red-400">{deadlineError}</p>
            ) : (
              <p className="text-sm text-zinc-500">
                The block number after which the campaign ends
                {currentBlock !== null && (
                  <span className="ml-1">(current: #{currentBlock.toString()})</span>
                )}
              </p>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={!signer || loading}
          className="w-full px-4 py-3 font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
        >
          {loading ? "Creating..." : "Create Campaign"}
        </button>
      </form>
    </div>
  );
}

