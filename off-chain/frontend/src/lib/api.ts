import { Campaign, Pledge } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init);
}

/**
 * Fetch all campaigns from the indexer
 */
export async function fetchCampaigns(): Promise<Campaign[]> {
  const res = await apiFetch(`${API_BASE}/campaigns`);
  if (!res.ok) {
    throw new Error(`Failed to fetch campaigns: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch a single campaign by ID
 */
export async function fetchCampaign(id: string): Promise<Campaign | null> {
  const res = await apiFetch(`${API_BASE}/campaigns/${encodeURIComponent(id)}`);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch campaign: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch pledges for a campaign
 */
export async function fetchPledgesForCampaign(campaignId: string): Promise<Pledge[]> {
  const res = await apiFetch(`${API_BASE}/campaigns/${encodeURIComponent(campaignId)}/pledges`);
  if (!res.ok) {
    throw new Error(`Failed to fetch pledges: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch all pledges
 */
export async function fetchPledges(): Promise<Pledge[]> {
  const res = await apiFetch(`${API_BASE}/pledges`);
  if (!res.ok) {
    throw new Error(`Failed to fetch pledges: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch pledges for a specific backer
 */
export async function fetchBackerPledges(lockHash: string): Promise<Pledge[]> {
  const res = await apiFetch(`${API_BASE}/pledges/backer/${encodeURIComponent(lockHash)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch backer pledges: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch current block number
 */
export async function fetchBlockNumber(): Promise<bigint> {
  const res = await apiFetch(`${API_BASE}/tip`);
  if (!res.ok) {
    throw new Error(`Failed to fetch block number: ${res.statusText}`);
  }
  const data = await res.json();
  return BigInt(data.blockNumber);
}

/**
 * Check API health
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await apiFetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
