"use client";

import { useEffect, useState, useCallback } from "react";
import { Campaign } from "@/lib/types";
import { fetchCampaigns, fetchBlockNumber, checkHealth } from "@/lib/api";
import { CampaignCard } from "@/components/CampaignCard";
import { SkeletonCard } from "@/components/Skeleton";
import Link from "next/link";

/**
 * Filter campaigns by effective status
 */
function filterCampaigns(campaigns: Campaign[], selectedFilter: string, currentBlock: bigint | null): Campaign[] {
  if (selectedFilter === "All") {
    return campaigns;
  }

  return campaigns.filter((campaign) => {
    const isExpired = currentBlock !== null && BigInt(campaign.deadlineBlock) < currentBlock;

    let effectiveStatus: string;
    if (campaign.status === 0) { // Active
      if (!isExpired) {
        effectiveStatus = "active";
      } else {
        const totalPledged = BigInt(campaign.totalPledged);
        const fundingGoal = BigInt(campaign.fundingGoal);
        effectiveStatus = totalPledged >= fundingGoal ? "expired_success" : "expired_failed";
      }
    } else if (campaign.status === 1) { // Success
      effectiveStatus = "success";
    } else { // Failed (status === 2)
      effectiveStatus = "failed";
    }

    switch (selectedFilter) {
      case "Active":
        return effectiveStatus === "active";
      case "Funded":
        return effectiveStatus === "success";
      case "Unsuccessful":
        return effectiveStatus === "failed";
      case "Expired":
        return effectiveStatus === "expired_success" || effectiveStatus === "expired_failed";
      default:
        return true;
    }
  });
}

export default function Home() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [currentBlock, setCurrentBlock] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiOnline, setApiOnline] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>("All");

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);

    const isOnline = await checkHealth();
    setApiOnline(isOnline);

    if (!isOnline) {
      setError("Indexer API is offline. Make sure it's running on port 3001.");
      if (!isRefresh) setLoading(false);
      return;
    }

    try {
      const [campaignsData, blockNum] = await Promise.all([
        fetchCampaigns(),
        fetchBlockNumber(),
      ]);

      setCampaigns(campaignsData);
      setCurrentBlock(blockNum);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      if (!isRefresh) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => load(true), 30000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Campaigns</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Browse and support crowdfunding campaigns on CKB
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="px-4 py-2 font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          Create Campaign
        </Link>
      </div>

      {/* API Status */}
      <div className="mb-6 flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${
            apiOnline ? "bg-green-500" : "bg-red-500"
          }`}
        />
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          Indexer API: {apiOnline ? "Online" : "Offline"}
        </span>
      </div>

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {!loading && !error && campaigns.length === 0 && (
        <div className="text-center py-12 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg">
          <p className="text-zinc-600 dark:text-zinc-400 mb-4">
            No campaigns found. Be the first to create one!
          </p>
          <Link
            href="/campaigns/new"
            className="inline-block px-4 py-2 font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            Create Campaign
          </Link>
        </div>
      )}

      {!loading && !error && campaigns.length > 0 && (
        <div>
          {/* Filter Tabs */}
          <div className="mb-6 flex flex-wrap gap-2">
            {["All", "Active", "Funded", "Unsuccessful", "Expired"].map((tab) => (
              <button
                key={tab}
                onClick={() => setSelectedFilter(tab)}
                className={`px-3 py-1 rounded font-medium transition-colors ${
                  selectedFilter === tab
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Campaign Grid */}
          {filterCampaigns(campaigns, selectedFilter, currentBlock).length === 0 ? (
            <div className="text-center py-12 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg">
              <p className="text-zinc-600 dark:text-zinc-400">
                No campaigns found with status "{selectedFilter}"
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filterCampaigns(campaigns, selectedFilter, currentBlock).map((campaign) => (
                <CampaignCard
                  key={campaign.campaignId}
                  campaign={campaign}
                  currentBlock={currentBlock}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
