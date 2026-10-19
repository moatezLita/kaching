import type { Sale } from "../sale";

export interface SaleSource {
  mode: "stripe" | "demo";
  /** How long the stream waits between poll() calls. */
  pollIntervalMs: number;
  /** Everything since `sinceSec`, oldest first. */
  backfill(sinceSec: number): Promise<{ sales: Sale[]; truncated: boolean }>;
  /** Sales not returned before, oldest first. */
  poll(): Promise<Sale[]>;
}
