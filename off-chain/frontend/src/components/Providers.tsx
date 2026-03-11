"use client";

import { ccc } from "@ckb-ccc/connector-react";
import { ReactNode } from "react";
import { DevnetProvider } from "./DevnetContext";
import { ToastProvider } from "./Toast";

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ccc.Provider>
      <DevnetProvider>
        <ToastProvider>{children}</ToastProvider>
      </DevnetProvider>
    </ccc.Provider>
  );
}
