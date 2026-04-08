import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { DB_ROOT } from "../../lib/paths";

const IS_HOSTED = process.env.NEXT_PUBLIC_MODE === "hosted";

/**
 * GET /api/schema?db_id=california_schools
 * Returns the DDL schema for a database (CREATE TABLE statements).
 */
export async function GET(req: NextRequest) {
  const dbId = req.nextUrl.searchParams.get("db_id");

  if (!dbId || /[^a-zA-Z0-9_-]/.test(dbId)) {
    return NextResponse.json({ error: "Invalid db_id" }, { status: 400 });
  }

  if (IS_HOSTED) {
    return fetchSchemaFromTurso(dbId);
  }
  return fetchSchemaLocally(dbId);
}

async function fetchSchemaLocally(dbId: string) {
  const dbPath = path.join(DB_ROOT, dbId, `${dbId}.sqlite`);
  if (!fs.existsSync(dbPath)) {
    return NextResponse.json({ error: `Database not found: ${dbId}` }, { status: 404 });
  }

  const Database = (await import("better-sqlite3")).default;
  const db = new Database(dbPath, { readonly: true });
  db.pragma("journal_mode = OFF");

  try {
    const tables = db
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as { name: string; sql: string }[];

    const schema = tables.map((t) => t.sql).join(";\n\n") + ";";

    return NextResponse.json({ db_id: dbId, schema, tables: tables.map((t) => t.name) });
  } finally {
    db.close();
  }
}

async function fetchSchemaFromTurso(dbId: string) {
  const tursoName = dbId.replace(/_/g, "-");
  const org = process.env.TURSO_ORG;
  const region = process.env.TURSO_REGION || "aws-ap-south-1";
  const token = process.env.TURSO_AUTH_TOKEN;

  if (!org || !token) {
    return NextResponse.json({ error: "Turso not configured" }, { status: 500 });
  }

  const baseUrl = `https://${tursoName}-${org}.${region}.turso.io`;

  const resp = await fetch(`${baseUrl}/v2/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          type: "execute",
          stmt: {
            sql: "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
          },
        },
        { type: "close" },
      ],
    }),
  });

  if (!resp.ok) {
    return NextResponse.json({ error: `Turso error: ${resp.status}` }, { status: 500 });
  }

  const data = await resp.json();
  const result = data.results?.[0]?.response?.result;
  if (!result) {
    return NextResponse.json({ error: "No schema result" }, { status: 500 });
  }

  const tables: string[] = [];
  const ddls: string[] = [];
  for (const row of result.rows) {
    tables.push(row[0].value as string);
    ddls.push(row[1].value as string);
  }

  return NextResponse.json({
    db_id: dbId,
    schema: ddls.join(";\n\n") + ";",
    tables,
  });
}
