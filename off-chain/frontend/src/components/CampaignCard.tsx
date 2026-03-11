"use client";

import Link from "next/link";
import { Campaign, CampaignStatus } from "@/lib/types";
import {
  shannonsToCKB,
  formatHash,
  getEffectiveStatusLabel,
  getEffectiveStatusColor,
  getFundingProgress,
  blocksToTimeEstimate,
} from "@/lib/utils";

interface CampaignCardProps {
  campaign: Campaign;
  currentBlock: bigint | null;
  backerCount: number;
}

export function CampaignCard({ campaign, currentBlock, backerCount }: CampaignCardProps) {
  const progress = getFundingProgress(campaign.totalPledged, campaign.fundingGoal);

  // Compute effective status
  const isExpired = currentBlock !== null && BigInt(campaign.deadlineBlock) < currentBlock;
  const effectiveStatus = campaign.effectiveStatus || (
    campaign.status === CampaignStatus.Active
      ? (isExpired
        ? (BigInt(campaign.totalPledged) >= BigInt(campaign.fundingGoal) ? "expired_success" : "expired_failed")
        : "active")
      : campaign.status === CampaignStatus.Success ? "success" : "failed"
  );

  // Time remaining
  const blocksRemaining = currentBlock !== null
    ? BigInt(campaign.deadlineBlock) - currentBlock
    : null;

  return (
    <Link href={`/campaigns/${encodeURIComponent(campaign.campaignId)}`}>
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 sm:p-6 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            {campaign.title ? (
              <h3 className="font-semibold text-lg leading-tight truncate">
                {campaign.title}
              </h3>
            ) : (
              <>
                <p className="text-sm text-zinc-500 dark:text-zinc-500 mb-1">
                  Campaign
                </p>
                <p className="font-mono text-sm">
                  {formatHash(campaign.campaignId)}
                </p>
              </>
            )}
          </div>
          <span
            className={`px-2 py-1 text-xs font-medium rounded whitespace-nowrap ml-2 ${getEffectiveStatusColor(effectiveStatus)}`}
          >
            {getEffectiveStatusLabel(effectiveStatus)}
          </span>
        </div>

        {campaign.description && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3 line-clamp-2">
            {campaign.description}
          </p>
        )}

        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-zinc-600 dark:text-zinc-400">Progress</span>
              <span className="font-medium">{progress.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all"
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Pledged</span>
            <span className="font-medium">
              {shannonsToCKB(campaign.totalPledged)} CKB
            </span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Goal</span>
            <span className="font-medium">
              {shannonsToCKB(campaign.fundingGoal)} CKB
            </span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Deadline</span>
            <span className="font-medium">
              Block #{campaign.deadlineBlock}
              {blocksRemaining !== null && (
                <span className="text-zinc-500 ml-1 text-xs">
                  ({blocksRemaining > 0n
                    ? blocksToTimeEstimate(blocksRemaining) + " left"
                    : "Expired"})
                </span>
              )}
            </span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Backers</span>
            <span className="font-medium">{backerCount}</span>
          </div>

          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-xs text-zinc-500">
              Creator: {formatHash(campaign.creator)}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
