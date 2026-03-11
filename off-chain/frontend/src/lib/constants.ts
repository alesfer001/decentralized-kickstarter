/**
 * Contract deployment information
 * These are the deployed contract addresses on OffCKB devnet
 * Updated: 2026-02-03
 */
export const CONTRACTS = {
  campaign: {
    codeHash: "0x0f5667918b120ccdd5e236b43a724ca5edbef52299b19390d4ce703959667e10",
    hashType: "data2" as const,
    txHash: "0x78a09aa811982bc6c7800bb5cba7036d1d2582dc97fa5e82e6177691891e0150",
    index: 0,
  },
  pledge: {
    codeHash: "0x27182bbbe47d80cce33169d4b791d80a654cf9947cb4172783e444005f098065",
    hashType: "data2" as const,
    txHash: "0x179497fc7a4792a50f2f0636bc16d41d6473217485b5bc453dc00c5d98e09fcb",
    index: 0,
  },
};

/**
 * CKB RPC URL
 */
export const CKB_RPC_URL = process.env.NEXT_PUBLIC_CKB_RPC_URL || "http://127.0.0.1:8114";

/**
 * Indexer API URL
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/**
 * Campaign data size in bytes
 */
export const CAMPAIGN_DATA_SIZE = 65;

/**
 * Pledge data size in bytes
 */
export const PLEDGE_DATA_SIZE = 72;

/**
 * DEVNET ONLY — Test accounts (from OffCKB)
 * These accounts are pre-funded with 42,000,000 CKB each.
 * WARNING: These private keys are publicly known. NEVER use on mainnet or testnet with real funds.
 */
export const DEVNET_ACCOUNTS = [
  {
    address: "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvwg2cen8extgq8s5puft8vf40px3f599cytcyd8",
    privkey: "0x6109170b275a09ad54877b82f7d9930f88cab5717d484fb4741ae9d1dd078cd6", // DEVNET ONLY
    lockArg: "0x8e42b1999f265a0078503c4acec4d5e134534297",
  },
  {
    address: "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqt435c3epyrupszm7khk6weq5lrlyt52lg48ucew",
    privkey: "0x9f315d5a9618a39fdc487c7a67a8581d40b045bd7a42d83648ca80ef3b2cb4a1", // DEVNET ONLY
    lockArg: "0x758d311c8483e0602dfad7b69d9053e3f917457d",
  },
];

/**
 * Whether to use devnet mode (auto-connect with test account)
 */
export const USE_DEVNET_MODE = process.env.NEXT_PUBLIC_USE_DEVNET !== "false";
