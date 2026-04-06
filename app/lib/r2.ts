import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

const IS_HOSTED = process.env.NEXT_PUBLIC_MODE === "hosted";

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT!,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _client;
}

const BUCKET = process.env.R2_BUCKET || "insightxpert-results";

/** List all object keys in the R2 bucket. */
export async function listResultKeys(): Promise<string[]> {
  const client = getClient();
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const resp = await client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        ContinuationToken: continuationToken,
      })
    );
    for (const obj of resp.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    continuationToken = resp.IsTruncated
      ? resp.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return keys;
}

/** Fetch a JSON file from R2 by key and return parsed content. */
export async function getResultJson(key: string): Promise<unknown> {
  const client = getClient();
  const resp = await client.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key })
  );
  const body = await resp.Body!.transformToString("utf-8");
  return JSON.parse(body);
}

/** Fetch raw text from R2 (for summary extraction without full parse). */
export async function getResultText(key: string): Promise<string> {
  const client = getClient();
  const resp = await client.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key })
  );
  return await resp.Body!.transformToString("utf-8");
}

export { IS_HOSTED };
