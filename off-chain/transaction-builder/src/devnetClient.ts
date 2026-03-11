import { ccc } from "@ckb-ccc/core";

/**
 * OffCKB Devnet system script configuration
 *
 * These cell deps are specific to the local OffCKB devnet and differ from
 * the public CKB testnet. The dep_group transaction is:
 * 0x4d804f1495612631da202fe9902fa9899118554b08138cfe5dfb50e1ede76293
 */
export const OFFCKB_DEVNET_SCRIPTS: Record<ccc.KnownScript, ccc.ScriptInfoLike | undefined> = {
  // Secp256k1Blake160 - used for standard CKB addresses
  [ccc.KnownScript.Secp256k1Blake160]: {
    codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
    hashType: "type",
    cellDeps: [
      {
        cellDep: {
          outPoint: {
            txHash: "0x4d804f1495612631da202fe9902fa9899118554b08138cfe5dfb50e1ede76293",
            index: 0,
          },
          depType: "depGroup",
        },
      },
    ],
  },
  // Secp256k1Multisig - used for multisig addresses
  [ccc.KnownScript.Secp256k1Multisig]: {
    codeHash: "0x5c5069eb0857efc65e1bca0c07df34c31663b3622fd3876c876320fc9634e2a8",
    hashType: "type",
    cellDeps: [
      {
        cellDep: {
          outPoint: {
            txHash: "0x4d804f1495612631da202fe9902fa9899118554b08138cfe5dfb50e1ede76293",
            index: 1,
          },
          depType: "depGroup",
        },
      },
    ],
  },
  // TypeId - built-in, no cell deps needed
  [ccc.KnownScript.TypeId]: {
    codeHash: "0x00000000000000000000000000000000000000000000000000545950455f4944",
    hashType: "type",
    cellDeps: [],
  },
  // AnyoneCanPay - for single-use payment addresses
  [ccc.KnownScript.AnyoneCanPay]: {
    codeHash: "0xe09352af0066f3162287763ce4ddba9af6bfaeab198dc7ab37f8c71c9e68bb5b",
    hashType: "type",
    cellDeps: [
      {
        cellDep: {
          outPoint: {
            txHash: "0x1bb87da347a776a927ab6593e1e10304ca195f8e24279f039008d5e3115b1bf7",
            index: 8, // AnyoneCanPay code cell at genesis index 8
          },
          depType: "code",
        },
      },
      // Also need secp256k1_data for AnyoneCanPay
      {
        cellDep: {
          outPoint: {
            txHash: "0x1bb87da347a776a927ab6593e1e10304ca195f8e24279f039008d5e3115b1bf7",
            index: 3, // secp256k1_data
          },
          depType: "code",
        },
      },
    ],
  },
  // NervosDao - for DAO deposits (needed for cell checks)
  [ccc.KnownScript.NervosDao]: {
    codeHash: "0x82d76d1b75fe2fd9a27dfbaa65a039221a380d76c926f378d3f81cf3e7e13f2e",
    hashType: "type",
    cellDeps: [
      {
        cellDep: {
          outPoint: {
            txHash: "0x1bb87da347a776a927ab6593e1e10304ca195f8e24279f039008d5e3115b1bf7",
            index: 2, // DAO code cell at genesis index 2
          },
          depType: "code",
        },
      },
    ],
  },
  [ccc.KnownScript.Secp256k1MultisigV2]: undefined,
  [ccc.KnownScript.XUdt]: undefined,
  [ccc.KnownScript.JoyId]: undefined,
  [ccc.KnownScript.COTA]: undefined,
  [ccc.KnownScript.PWLock]: undefined,
  [ccc.KnownScript.OmniLock]: undefined,
  [ccc.KnownScript.NostrLock]: undefined,
  [ccc.KnownScript.UniqueType]: undefined,
  [ccc.KnownScript.AlwaysSuccess]: undefined,
  [ccc.KnownScript.InputTypeProxyLock]: undefined,
  [ccc.KnownScript.OutputTypeProxyLock]: undefined,
  [ccc.KnownScript.LockProxyLock]: undefined,
  [ccc.KnownScript.SingleUseLock]: undefined,
  [ccc.KnownScript.TypeBurnLock]: undefined,
  [ccc.KnownScript.EasyToDiscoverType]: undefined,
  [ccc.KnownScript.TimeLock]: undefined,
};

/**
 * Create a CCC client configured for OffCKB devnet
 *
 * @param rpcUrl - The devnet RPC URL (default: http://127.0.0.1:8114)
 * @returns CCC client configured for OffCKB devnet
 */
export function createDevnetClient(rpcUrl: string = "http://127.0.0.1:8114"): ccc.Client {
  // Use ClientPublicTestnet but override the scripts with devnet configuration
  return new ccc.ClientPublicTestnet({
    url: rpcUrl,
    scripts: OFFCKB_DEVNET_SCRIPTS,
    fallbacks: [], // No fallbacks for local devnet
  });
}
