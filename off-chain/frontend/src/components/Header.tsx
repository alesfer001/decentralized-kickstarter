"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ccc } from "@ckb-ccc/connector-react";
import { formatHash, shannonsToCKB } from "@/lib/utils";
import { useDevnet } from "./DevnetContext";

// Tailwind safelist (ensures dynamic classes are not purged):
// bg-orange-500/20 text-orange-400 border-orange-500/30
// bg-blue-500/20 text-blue-400 border-blue-500/30
// bg-green-500/20 text-green-400 border-green-500/30
const NETWORK_BADGE: Record<string, { label: string; classes: string }> = {
  devnet: {
    label: "Devnet",
    classes: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  },
  testnet: {
    label: "Testnet",
    classes: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  mainnet: {
    label: "Mainnet",
    classes: "bg-green-500/20 text-green-400 border-green-500/30",
  },
};

export function Header() {
  const { wallet, open, disconnect } = ccc.useCcc();
  const walletSigner = ccc.useSigner();
  const { network, isDevnet, devnetSigner, devnetAddress, activeAccountIndex, switchAccount, accounts } = useDevnet();
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);

  const signer = isDevnet ? devnetSigner : walletSigner;
  const isConnected = isDevnet ? !!devnetSigner : !!wallet;

  useEffect(() => {
    async function getAddress() {
      if (isDevnet && devnetAddress) {
        setAddress(devnetAddress);
      } else if (walletSigner) {
        try {
          const addr = await walletSigner.getRecommendedAddress();
          setAddress(addr);
        } catch {
          setAddress(null);
        }
      } else {
        setAddress(null);
      }
    }
    getAddress();
  }, [isDevnet, devnetAddress, walletSigner]);

  const fetchBalance = useCallback(async () => {
    if (!signer) {
      setBalance(null);
      return;
    }
    try {
      const bal = await signer.getBalance();
      setBalance(shannonsToCKB(bal));
    } catch {
      setBalance(null);
    }
  }, [signer]);

  // Fetch balance on signer change and every 15s
  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 15000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  const badge = NETWORK_BADGE[network];

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 sm:gap-8">
          <Link href="/" className="text-lg sm:text-xl font-bold whitespace-nowrap">
            CKB Kickstarter
          </Link>
          <nav className="flex items-center gap-3 sm:gap-6">
            <Link
              href="/"
              className="text-sm sm:text-base text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Campaigns
            </Link>
            <Link
              href="/campaigns/new"
              className="text-sm sm:text-base text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Create
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {badge && (
            <span className={`px-2 py-1 text-xs font-medium rounded border ${badge.classes}`}>
              {badge.label}
            </span>
          )}
          {isConnected && address ? (
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Account switcher for devnet */}
              {isDevnet && (
                <select
                  value={activeAccountIndex}
                  onChange={(e) => switchAccount(parseInt(e.target.value))}
                  className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none min-h-[32px]"
                >
                  {accounts.map((acc, i) => (
                    <option key={i} value={i}>
                      Account #{i} ({formatHash(acc.lockArg, 4)})
                    </option>
                  ))}
                </select>
              )}
              <div className="text-right">
                <span className="text-sm font-mono text-zinc-600 dark:text-zinc-400 block">
                  {formatHash(address, 6)}
                </span>
                {balance !== null && (
                  <span className="text-xs text-zinc-500">
                    {balance} CKB
                  </span>
                )}
              </div>
              {!isDevnet && (
                <button
                  onClick={disconnect}
                  className="px-4 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 min-h-[44px]"
                >
                  Disconnect
                </button>
              )}
            </div>
          ) : !isDevnet ? (
            <button
              onClick={open}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 min-h-[44px]"
            >
              Connect Wallet
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
