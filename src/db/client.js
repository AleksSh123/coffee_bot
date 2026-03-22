import { Pool } from "pg";

import { ensureDatabaseSchema } from "./schema.js";

export function createDatabase({ connectionString, logger }) {
  const pool = new Pool({
    connectionString
  });

  async function query(text, params) {
    return pool.query(text, params);
  }

  async function transaction(callback) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await callback({
        query(text, params) {
          return client.query(text, params);
        }
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    async connect() {
      await query("SELECT 1");
      await ensureDatabaseSchema({ query });
      logger?.info("database.connection.ready");
    },
    async close() {
      await pool.end();
      logger?.info("database.connection.closed");
    },
    query,
    transaction
  };
}
