import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { DB_ROOT } from "../../lib/paths";

const IS_HOSTED = process.env.NEXT_PUBLIC_MODE === "hosted";
const MAX_ROWS = 50;

/** Map db_id (underscores) to Turso db name (dashes). */
function tursoDbName(dbId: string): string {
  return dbId.replace(/_/g, "-");
}

async function executeOnTurso(dbId: string, sql: string) {
  const { createClient } = await import("@libsql/client");
  const tursoName = tursoDbName(dbId);
  const url = `libsql://${tursoName}-${process.env.TURSO_ORG}.turso.io`;

  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  try {
    const result = await client.execute(sql);
    const columns = result.columns;
    const rows = result.rows.map((row) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });

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
    client.close();
  }
}

async function executeLocally(dbId: string, sql: string) {
  const dbPath = path.join(DB_ROOT, dbId, `${dbId}.sqlite`);
  if (!fs.existsSync(dbPath)) {
    return NextResponse.json(
      { error: `Database not found: ${dbId}` },
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
}

export async function POST(req: NextRequest) {
  try {
    const { db_id, sql } = await req.json();

    if (!db_id || !sql) {
      return NextResponse.json(
        { error: "db_id and sql are required" },
        { status: 400 }
      );
    }

    // Sanitize db_id
    if (/[^a-zA-Z0-9_]/.test(db_id)) {
      return NextResponse.json(
        { error: "Invalid db_id" },
        { status: 400 }
      );
    }

    if (IS_HOSTED) {
      return executeOnTurso(db_id, sql);
    }
    return executeLocally(db_id, sql);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
