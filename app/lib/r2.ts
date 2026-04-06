/**
 * R2 access via Cloudflare API (listing) and public r2.dev URL (fetching).
 * No AWS SDK — plain fetch, works on any runtime including Vercel serverless.
 */

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const CF_API_TOKEN = process.env.R2_API_TOKEN!;
const BUCKET = process.env.R2_BUCKET || "insightxpert-results";
const PUBLIC_DOMAIN = process.env.R2_PUBLIC_DOMAIN!; // e.g. pub-xxx.r2.dev

/** List all object keys in the R2 bucket via Cloudflare API. */
export async function listResultKeys(): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects`
    );
    url.searchParams.set("per_page", "500");
    if (cursor) url.searchParams.set("cursor", cursor);

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
    });

    if (!resp.ok) {
      throw new Error(`R2 list failed: ${resp.status} ${await resp.text()}`);
    }

    const json = await resp.json();
    const result = (json as { result: { key: string }[] }).result;
    for (const obj of result) {
      keys.push(obj.key);
    }

    // Cloudflare API uses cursor-based pagination
    const info = (json as { result_info?: { cursor?: string; count?: number } })
      .result_info;
    cursor =
      info && info.count && info.count >= 500 ? info.cursor : undefined;
  } while (cursor);

  return keys;
}

/** Fetch a JSON file from R2 via public URL and return parsed content. */
export async function getResultJson(key: string): Promise<unknown> {
  const url = `https://${PUBLIC_DOMAIN}/${encodeURIComponent(key).replace(/%2F/g, "/")}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`R2 fetch failed for ${key}: ${resp.status}`);
  }
  return resp.json();
}

/** Fetch raw text from R2 via public URL. */
export async function getResultText(key: string): Promise<string> {
  const url = `https://${PUBLIC_DOMAIN}/${encodeURIComponent(key).replace(/%2F/g, "/")}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`R2 fetch failed for ${key}: ${resp.status}`);
  }
  return resp.text();
}
