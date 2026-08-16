/** Build object URL from public base (no trailing slash) and object key. */
export function buildPublicObjectUrl(
  publicUrlBase: string,
  objectKey: string,
): string {
  const base = publicUrlBase.replace(/\/+$/, "");
  const key = objectKey.replace(/^\/+/, "");
  return `${base}/${key}`;
}

/**
 * Extract object key from a stored public URL.
 * Prefers the configured public base; falls back to common S3 URL shapes.
 */
export function extractObjectKeyFromUrl(
  url: string,
  publicUrlBase: string,
  bucketName: string,
): string {
  const base = publicUrlBase.replace(/\/+$/, "");
  if (base && url.startsWith(`${base}/`)) {
    return url.slice(base.length + 1);
  }

  const amazonHost = `https://${bucketName}.s3.amazonaws.com/`;
  if (url.startsWith(amazonHost)) {
    return url.slice(amazonHost.length);
  }

  const pathStyleMatch = url.match(
    /^https?:\/\/[^/]+\/([^/]+)\/(.+)$/,
  );
  if (pathStyleMatch && pathStyleMatch[1] === bucketName) {
    return pathStyleMatch[2];
  }

  throw new Error(`Cannot extract object key from media URL: ${url}`);
}
