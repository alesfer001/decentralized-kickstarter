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
    "0x0f5667918b120ccdd5e236b43a724ca5edbef52299b19390d4ce703959667e10";
  const PLEDGE_CODE_HASH =
    process.env.PLEDGE_CODE_HASH ||
    "0x27182bbbe47d80cce33169d4b791d80a654cf9947cb4172783e444005f098065";

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
    const result = await indexer.indexAll(CAMPAIGN_CODE_HASH, PLEDGE_CODE_HASH);
    console.log(`Indexed ${result.campaigns} campaigns and ${result.pledges} pledges`);
  } catch (error) {
    console.error("Error during initial indexing:", error);
  }

  // Start background polling
  indexer.startBackgroundIndexing(CAMPAIGN_CODE_HASH, PLEDGE_CODE_HASH, POLL_INTERVAL);

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
