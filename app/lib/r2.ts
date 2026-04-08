/**
 * R2 access via public r2.dev URL. No SDK — plain fetch.
 */

const PUBLIC_DOMAIN = process.env.R2_PUBLIC_DOMAIN!; // e.g. pub-xxx.r2.dev

/** Fetch a JSON file from R2 via public URL and return parsed content. */
export async function getResultJson(key: string): Promise<unknown> {
  const url = `https://${PUBLIC_DOMAIN}/${encodeURIComponent(key).replace(/%2F/g, "/")}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`R2 fetch failed for ${key}: ${resp.status}`);
  }
  return resp.json();
}
