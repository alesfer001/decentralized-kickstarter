"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { ccc } from "@ckb-ccc/connector-react";
import { CKB_RPC_URL, DEVNET_ACCOUNTS, USE_DEVNET_MODE } from "@/lib/constants";
import { createDevnetClient } from "@/lib/devnetClient";

interface DevnetContextType {
  isDevnet: boolean;
  devnetSigner: ccc.Signer | null;
  devnetAddress: string | null;
  client: ccc.Client | null;
  activeAccountIndex: number;
  switchAccount: (index: number) => void;
  accounts: typeof DEVNET_ACCOUNTS;
}

const DevnetContext = createContext<DevnetContextType>({
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
    if (!USE_DEVNET_MODE) return;

    async function initDevnet() {
      try {
        const devnetClient = createDevnetClient(CKB_RPC_URL);
        setClient(devnetClient);

        const signer = new ccc.SignerCkbPrivateKey(
          devnetClient,
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
        isDevnet: USE_DEVNET_MODE,
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
