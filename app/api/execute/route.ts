import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { DB_ROOT } from "../../lib/paths";
import { hostedModeGuard } from "../../lib/guards";

const MAX_ROWS = 50;

export async function POST(req: NextRequest) {
  const blocked = hostedModeGuard();
  if (blocked) return blocked;

  try {
    const { db_id, sql } = await req.json();

    if (!db_id || !sql) {
      return NextResponse.json(
        { error: "db_id and sql are required" },
        { status: 400 }
      );
    }

    // Sanitize db_id to prevent path traversal
    if (/[^a-zA-Z0-9_]/.test(db_id)) {
      return NextResponse.json(
        { error: "Invalid db_id" },
        { status: 400 }
      );
    }

    const dbPath = path.join(DB_ROOT, db_id, `${db_id}.sqlite`);
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json(
        { error: `Database not found: ${db_id}` },
        { status: 404 }
      );
    }

    const Database = (await import("better-sqlite3")).default;
    const db = new Database(dbPath, { readonly: true });
    db.pragma("journal_mode = OFF");

    try {
      const stmt = db.prepare(sql);
      const rows = stmt.all() as Record<string, unknown>[];
      const columns = stmt.columns().map((c) => c.name);

      const truncated = rows.length > MAX_ROWS;
      const displayRows = rows.slice(0, MAX_ROWS);

      return NextResponse.json({
        columns,
        rows: displayRows,
        total_rows: rows.length,
        truncated,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg, columns: [], rows: [] });
    } finally {
      db.close();
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
