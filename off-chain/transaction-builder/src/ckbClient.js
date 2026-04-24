"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCkbClient = createCkbClient;
const core_1 = require("@ckb-ccc/core");
/**
 * OffCKB Devnet system script configuration
 *
 * These cell deps are specific to the local OffCKB devnet and differ from
 * the public CKB testnet. The dep_group transaction is:
 * 0x75be96e1871693f030db27ddae47890a28ab180e88e36ebb3575d9f1377d3da7
 */
const OFFCKB_DEVNET_SCRIPTS = {
    [core_1.ccc.KnownScript.Secp256k1Blake160]: {
        codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
        hashType: "type",
        cellDeps: [
            {
                cellDep: {
                    outPoint: {
                        txHash: "0x75be96e1871693f030db27ddae47890a28ab180e88e36ebb3575d9f1377d3da7",
                        index: 0,
                    },
                    depType: "depGroup",
                },
            },
        ],
    },
    [core_1.ccc.KnownScript.Secp256k1Multisig]: {
        codeHash: "0x5c5069eb0857efc65e1bca0c07df34c31663b3622fd3876c876320fc9634e2a8",
        hashType: "type",
        cellDeps: [
            {
                cellDep: {
                    outPoint: {
                        txHash: "0x75be96e1871693f030db27ddae47890a28ab180e88e36ebb3575d9f1377d3da7",
                        index: 1,
                    },
                    depType: "depGroup",
                },
            },
        ],
    },
    [core_1.ccc.KnownScript.TypeId]: {
        codeHash: "0x00000000000000000000000000000000000000000000000000545950455f4944",
        hashType: "type",
        cellDeps: [],
    },
    [core_1.ccc.KnownScript.AnyoneCanPay]: {
        codeHash: "0xe09352af0066f3162287763ce4ddba9af6bfaeab198dc7ab37f8c71c9e68bb5b",
        hashType: "type",
        cellDeps: [
            {
                cellDep: {
                    outPoint: {
                        txHash: "0x1dbed8dcfe0f18359c65c5e9546fd15cd69de73ea0a502345be30180649c9467",
                        index: 8,
                    },
                    depType: "code",
                },
            },
            {
                cellDep: {
                    outPoint: {
                        txHash: "0x1dbed8dcfe0f18359c65c5e9546fd15cd69de73ea0a502345be30180649c9467",
                        index: 3,
                    },
                    depType: "code",
                },
            },
        ],
    },
    [core_1.ccc.KnownScript.NervosDao]: {
        codeHash: "0x82d76d1b75fe2fd9a27dfbaa65a039221a380d76c926f378d3f81cf3e7e13f2e",
        hashType: "type",
        cellDeps: [
            {
                cellDep: {
                    outPoint: {
                        txHash: "0x1dbed8dcfe0f18359c65c5e9546fd15cd69de73ea0a502345be30180649c9467",
                        index: 2,
                    },
                    depType: "code",
                },
            },
        ],
    },
    [core_1.ccc.KnownScript.Secp256k1MultisigV2]: undefined,
    [core_1.ccc.KnownScript.XUdt]: undefined,
    [core_1.ccc.KnownScript.JoyId]: undefined,
    [core_1.ccc.KnownScript.COTA]: undefined,
    [core_1.ccc.KnownScript.PWLock]: undefined,
    [core_1.ccc.KnownScript.OmniLock]: undefined,
    [core_1.ccc.KnownScript.NostrLock]: undefined,
    [core_1.ccc.KnownScript.UniqueType]: undefined,
    [core_1.ccc.KnownScript.AlwaysSuccess]: undefined,
    [core_1.ccc.KnownScript.InputTypeProxyLock]: undefined,
    [core_1.ccc.KnownScript.OutputTypeProxyLock]: undefined,
    [core_1.ccc.KnownScript.LockProxyLock]: undefined,
    [core_1.ccc.KnownScript.SingleUseLock]: undefined,
    [core_1.ccc.KnownScript.TypeBurnLock]: undefined,
    [core_1.ccc.KnownScript.EasyToDiscoverType]: undefined,
    [core_1.ccc.KnownScript.TimeLock]: undefined,
};
/**
 * Create a CCC client for the specified network.
 *
 * - devnet: ClientPublicTestnet with OffCKB devnet script overrides
 * - testnet: ClientPublicTestnet with built-in testnet scripts
 * - mainnet: ClientPublicMainnet with built-in mainnet scripts
 */
function createCkbClient(network, rpcUrl) {
    switch (network) {
        case "devnet":
            return new core_1.ccc.ClientPublicTestnet({
                url: rpcUrl || "http://127.0.0.1:8114",
                scripts: OFFCKB_DEVNET_SCRIPTS,
                fallbacks: [],
            });
        case "testnet":
            return new core_1.ccc.ClientPublicTestnet(rpcUrl ? { url: rpcUrl } : undefined);
        case "mainnet":
            return new core_1.ccc.ClientPublicMainnet(rpcUrl ? { url: rpcUrl } : undefined);
    }
}
