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

/**
 * Execute SQL via Turso's HTTP API (plain fetch, no SDK).
 * Docs: https://docs.turso.tech/sdk/http/reference
 */
async function executeOnTurso(dbId: string, sql: string) {
  const tursoName = tursoDbName(dbId);
  const org = process.env.TURSO_ORG;
  const region = process.env.TURSO_REGION || "aws-ap-south-1";
  const token = process.env.TURSO_AUTH_TOKEN;

  if (!org || !token) {
    return NextResponse.json({
      error: `Turso not configured: TURSO_ORG=${org ? "set" : "missing"}, TURSO_AUTH_TOKEN=${token ? "set" : "missing"}`,
      columns: [],
      rows: [],
    });
  }

  const baseUrl = `https://${tursoName}-${org}.${region}.turso.io`;

  try {
    const resp = await fetch(`${baseUrl}/v2/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          { type: "execute", stmt: { sql } },
          { type: "close" },
        ],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({
        error: `Turso HTTP ${resp.status}: ${text}`,
        columns: [],
        rows: [],
      });
    }

    const data = await resp.json();

    // Extract result from pipeline response
    const executeResult = data.results?.[0];
    if (executeResult?.type === "error") {
      return NextResponse.json({
        error: executeResult.error?.message || "Query execution failed",
        columns: [],
        rows: [],
      });
    }

    const result = executeResult?.response?.result;
    if (!result) {
      return NextResponse.json({
        error: "No result returned from Turso",
        columns: [],
        rows: [],
      });
    }

    const columns = result.cols.map(
      (c: { name: string }) => c.name
    );
    const rows = result.rows.map(
      (row: { type: string; value: unknown }[]) => {
        const obj: Record<string, unknown> = {};
        columns.forEach((col: string, i: number) => {
          const cell = row[i];
          obj[col] = cell.value;
        });
        return obj;
      }
    );

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
