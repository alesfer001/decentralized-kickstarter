"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { ccc } from "@ckb-ccc/connector-react";
import {
  CKB_RPC_URL,
  DEVNET_ACCOUNTS,
  IS_DEVNET,
  NETWORK,
  type NetworkType,
} from "@/lib/constants";
import { createCkbClient } from "@/lib/ckbClient";

interface DevnetContextType {
  network: NetworkType;
  isDevnet: boolean;
  devnetSigner: ccc.Signer | null;
  devnetAddress: string | null;
  client: ccc.Client | null;
  activeAccountIndex: number;
  switchAccount: (index: number) => void;
  accounts: typeof DEVNET_ACCOUNTS;
}

const DevnetContext = createContext<DevnetContextType>({
  network: NETWORK,
  isDevnet: false,
  devnetSigner: null,
  devnetAddress: null,
  client: null,
  activeAccountIndex: 0,
  switchAccount: () => {},
  accounts: DEVNET_ACCOUNTS,
});

export function useDevnet() {
  return useContext(DevnetContext);
}

interface DevnetProviderProps {
  children: ReactNode;
}

export function DevnetProvider({ children }: DevnetProviderProps) {
  const [devnetSigner, setDevnetSigner] = useState<ccc.Signer | null>(null);
  const [devnetAddress, setDevnetAddress] = useState<string | null>(null);
  const [client, setClient] = useState<ccc.Client | null>(null);
  const [activeAccountIndex, setActiveAccountIndex] = useState(
    parseInt(process.env.NEXT_PUBLIC_DEVNET_ACCOUNT || "0")
  );

  useEffect(() => {
    // Always create a client for the current network (needed for address parsing, etc.)
    const ckbClient = createCkbClient(NETWORK, CKB_RPC_URL);
    setClient(ckbClient);

    // Only create a private-key signer on devnet
    if (!IS_DEVNET) {
      setDevnetSigner(null);
      setDevnetAddress(null);
      return;
    }

    async function initDevnet() {
      try {
        const signer = new ccc.SignerCkbPrivateKey(
          ckbClient,
          DEVNET_ACCOUNTS[activeAccountIndex].privkey
        );

        setDevnetSigner(signer);

        const addr = await signer.getRecommendedAddress();
        setDevnetAddress(addr);

        console.log(`[Devnet] Connected with account #${activeAccountIndex}:`, addr);
      } catch (err) {
        console.error("[Devnet] Failed to initialize:", err);
      }
    }

    initDevnet();
  }, [activeAccountIndex]);

  function switchAccount(index: number) {
    if (index >= 0 && index < DEVNET_ACCOUNTS.length) {
      setActiveAccountIndex(index);
    }
  }

  return (
    <DevnetContext.Provider
      value={{
        network: NETWORK,
        isDevnet: IS_DEVNET,
        devnetSigner,
        devnetAddress,
        client,
        activeAccountIndex,
        switchAccount,
        accounts: DEVNET_ACCOUNTS,
      }}
    >
      {children}
    </DevnetContext.Provider>
  );
}
