import { open } from 'node:fs/promises';
import { ARTIFACT_BYTE_LIMIT } from '../../reasoning-core/src/schema.js';

/** Read a bounded regular UTF-8 file without first allocating for its untrusted size. */
export async function readUtf8Bounded(path: string, limit = ARTIFACT_BYTE_LIMIT): Promise<string> {
  const file = await open(path, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > limit) throw new Error(`File exceeds ${limit} bytes or is not a regular file`);
    const buffer = Buffer.allocUnsafe(limit + 1);
    let length = 0;
    while (length <= limit) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > limit) throw new Error(`File exceeds ${limit} bytes`);
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
  } finally { await file.close(); }
}
