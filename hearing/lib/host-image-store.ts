/**
 * In-memory store for dev/single-process hosting of uploaded bytes so Flask can fetch by URL.
 * Not suitable for serverless multi-instance production — use a real CDN (e.g. Bytescale) there.
 */
export type HostedImageEntry = {
  buffer: Buffer;
  contentType: string;
};

export const hostImageStore = new Map<string, HostedImageEntry>();
