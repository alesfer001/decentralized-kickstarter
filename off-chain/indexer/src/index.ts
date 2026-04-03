import "dotenv/config";
import { CampaignIndexer } from "./indexer";
import { IndexerAPI } from "./api";
import { Database } from "./database";

/**
 * Main entry point for the indexer service
 */
async function main() {
  // Configuration
  const RPC_URL = process.env.CKB_RPC_URL || "http://127.0.0.1:8114";
  const PORT = parseInt(process.env.PORT || "3001");
  const DB_PATH = process.env.DB_PATH || "./data/indexer.db";
  const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "10000");

  // Contract code hashes from deployment
  const CAMPAIGN_CODE_HASH =
    process.env.CAMPAIGN_CODE_HASH ||
    "0xb71c1c0bc80ddc5a16ef041f2adf1f9a9339b56ecd63c135607e7e5ebb6ea3fc";
  const PLEDGE_CODE_HASH =
    process.env.PLEDGE_CODE_HASH ||
    "0x423442d38b9e1fdfe68d0e878c4003317fe85408e202fd7de776205d289bc924";
  const RECEIPT_CODE_HASH = process.env.RECEIPT_CODE_HASH || "";
  const PLEDGE_LOCK_CODE_HASH = process.env.PLEDGE_LOCK_CODE_HASH || "";

  console.log("Starting Campaign Indexer...");
  console.log(`RPC URL: ${RPC_URL}`);
  console.log(`Port: ${PORT}`);
  console.log(`DB Path: ${DB_PATH}`);

  // Create database
  const db = new Database(DB_PATH);
  console.log("SQLite database initialized");

  // Create indexer instance
  const indexer = new CampaignIndexer(RPC_URL, db);

  // Test connection
  try {
    const tip = await indexer.getCurrentBlockNumber();
    console.log(`Connected to CKB node. Current block: ${tip}`);
  } catch (error) {
    console.error("Failed to connect to CKB node:", error);
    db.close();
    process.exit(1);
  }

  // Create and start API server
  const api = new IndexerAPI(indexer);
  api.start(PORT);

  // Initial indexing
  console.log("\nPerforming initial indexing...");
  try {
    const result = await indexer.indexAll(CAMPAIGN_CODE_HASH, PLEDGE_CODE_HASH, RECEIPT_CODE_HASH || undefined, PLEDGE_LOCK_CODE_HASH || undefined);
    console.log(`Indexed ${result.campaigns} campaigns, ${result.pledges} pledges, and ${result.receipts} receipts`);
  } catch (error) {
    console.error("Error during initial indexing:", error);
  }

  // Start background polling
  indexer.startBackgroundIndexing(CAMPAIGN_CODE_HASH, PLEDGE_CODE_HASH, POLL_INTERVAL, RECEIPT_CODE_HASH || undefined, PLEDGE_LOCK_CODE_HASH || undefined);

  console.log("\nIndexer is ready!");
  console.log(`API available at http://localhost:${PORT}`);
  console.log(`Try: http://localhost:${PORT}/health`);

  // Graceful shutdown handler
  function shutdown() {
    console.log("\nShutting down indexer...");
    indexer.stopBackgroundIndexing();
    api.stop();
    db.close();
    console.log("Cleanup complete");
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Start the application
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
