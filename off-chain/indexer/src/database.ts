import BetterSqlite3 from "better-sqlite3";
import path from "path";
import fs from "fs";

export interface DBCampaign {
  id: string;
  tx_hash: string;
  output_index: number;
  creator_lock_hash: string;
  creator_lock_code_hash: string | null;
  creator_lock_hash_type: string | null;
  creator_lock_args: string | null;
  funding_goal: string;
  deadline_block: string;
  total_pledged: string;
  status: number;
  title: string | null;
  description: string | null;
  created_at: string;
  original_tx_hash: string | null;
}

export interface DBPledge {
  id: string;
  tx_hash: string;
  output_index: number;
  campaign_id: string;
  backer_lock_hash: string;
  amount: string;
  created_at: string;
}

/**
 * SQLite database wrapper for indexer persistence
 */
export class Database {
  private db: BetterSqlite3.Database;

  constructor(dbPath: string = "./data/indexer.db") {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new BetterSqlite3(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.createSchema();
    this.migrate();
  }

  private createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        tx_hash TEXT NOT NULL,
        output_index INTEGER NOT NULL,
        creator_lock_hash TEXT NOT NULL,
        creator_lock_code_hash TEXT,
        creator_lock_hash_type TEXT,
        creator_lock_args TEXT,
        funding_goal TEXT NOT NULL,
        deadline_block TEXT NOT NULL,
        total_pledged TEXT NOT NULL,
        status INTEGER NOT NULL,
        title TEXT,
        description TEXT,
        created_at TEXT NOT NULL,
        original_tx_hash TEXT
      );

      CREATE TABLE IF NOT EXISTS pledges (
        id TEXT PRIMARY KEY,
        tx_hash TEXT NOT NULL,
        output_index INTEGER NOT NULL,
        campaign_id TEXT NOT NULL,
        backer_lock_hash TEXT NOT NULL,
        amount TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS indexer_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  /**
   * Run schema migrations for existing databases.
   */
  private migrate() {
    // Add creator lock script columns if they don't exist (added in Phase 13)
    const columns = this.db.prepare("PRAGMA table_info(campaigns)").all() as { name: string }[];
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has("creator_lock_code_hash")) {
      this.db.exec("ALTER TABLE campaigns ADD COLUMN creator_lock_code_hash TEXT");
      this.db.exec("ALTER TABLE campaigns ADD COLUMN creator_lock_hash_type TEXT");
      this.db.exec("ALTER TABLE campaigns ADD COLUMN creator_lock_args TEXT");
    }
  }

  /**
   * Replace all live cells atomically (matches the clear+rebuild pattern).
   * Deletes all existing rows and inserts the new set in a single transaction.
   */
  replaceLiveCells(campaigns: DBCampaign[], pledges: DBPledge[]) {
    const insertCampaign = this.db.prepare(`
      INSERT INTO campaigns (id, tx_hash, output_index, creator_lock_hash, creator_lock_code_hash, creator_lock_hash_type, creator_lock_args, funding_goal, deadline_block, total_pledged, status, title, description, created_at, original_tx_hash)
      VALUES (@id, @tx_hash, @output_index, @creator_lock_hash, @creator_lock_code_hash, @creator_lock_hash_type, @creator_lock_args, @funding_goal, @deadline_block, @total_pledged, @status, @title, @description, @created_at, @original_tx_hash)
    `);

    const insertPledge = this.db.prepare(`
      INSERT INTO pledges (id, tx_hash, output_index, campaign_id, backer_lock_hash, amount, created_at)
      VALUES (@id, @tx_hash, @output_index, @campaign_id, @backer_lock_hash, @amount, @created_at)
    `);

    const transaction = this.db.transaction(() => {
      this.db.exec("DELETE FROM campaigns");
      this.db.exec("DELETE FROM pledges");

      for (const c of campaigns) {
        insertCampaign.run(c);
      }
      for (const p of pledges) {
        insertPledge.run(p);
      }

      // Store last indexed timestamp
      this.db.prepare(
        "INSERT OR REPLACE INTO indexer_state (key, value) VALUES ('last_indexed', @value)"
      ).run({ value: new Date().toISOString() });
    });

    transaction();
  }

  getAllCampaigns(): DBCampaign[] {
    return this.db.prepare("SELECT * FROM campaigns").all() as DBCampaign[];
  }

  getCampaign(id: string): DBCampaign | undefined {
    return this.db.prepare("SELECT * FROM campaigns WHERE id = ?").get(id) as DBCampaign | undefined;
  }

  getPledgesForCampaign(campaignTxHash: string): DBPledge[] {
    const normalizedHash = campaignTxHash.toLowerCase();
    return (this.db.prepare("SELECT * FROM pledges").all() as DBPledge[]).filter(
      (p) => p.campaign_id.toLowerCase() === normalizedHash
    );
  }

  getPledgesForBacker(lockHash: string): DBPledge[] {
    const normalizedHash = lockHash.toLowerCase();
    return (this.db.prepare("SELECT * FROM pledges").all() as DBPledge[]).filter(
      (p) => p.backer_lock_hash.toLowerCase() === normalizedHash
    );
  }

  getAllPledges(): DBPledge[] {
    return this.db.prepare("SELECT * FROM pledges").all() as DBPledge[];
  }

  getState(key: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM indexer_state WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value;
  }

  close() {
    this.db.close();
  }
}
