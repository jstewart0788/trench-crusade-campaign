// Enough of the zip container to open a .rosz: the central directory, local
// headers, methods 0 (stored) and 8 (deflate). Inflating is the caller's:
// zlib.inflateRawSync in node, DecompressionStream("deflate-raw") in the browser.

export interface ZipEntry {
  name: string;
  method: number;
  compressed: Uint8Array;
  size: number;
}

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

export type InflateRaw = (data: Uint8Array) => Uint8Array | Promise<Uint8Array>;

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export function readZipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let p = bytes.length - 22; p >= 0 && p >= bytes.length - 22 - 0xffff; p--) {
    if (view.getUint32(p, true) === EOCD) {
      eocd = p;
      break;
    }
  }
  if (eocd === -1) throw new ZipError("Not a zip file (no end-of-central-directory record)");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder("utf-8");
  const entries: ZipEntry[] = [];
  for (let e = 0; e < count; e++) {
    if (view.getUint32(p, true) !== CENTRAL) throw new ZipError("Corrupt central directory");
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    if (view.getUint32(localOffset, true) !== LOCAL) throw new ZipError(`Corrupt local header for ${name}`);
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    entries.push({ name, method, size, compressed: bytes.subarray(dataStart, dataStart + compressedSize) });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** The roster XML inside a .rosz: its .ros entry, or its only entry. */
export async function unzipRoster(bytes: Uint8Array, inflateRaw: InflateRaw): Promise<string> {
  const entries = readZipEntries(bytes).filter((e) => !e.name.endsWith("/"));
  const entry = entries.find((e) => e.name.toLowerCase().endsWith(".ros")) ?? (entries.length === 1 ? entries[0] : undefined);
  if (!entry) throw new ZipError(`No .ros entry in the archive (entries: ${entries.map((e) => e.name).join(", ") || "none"})`);
  let data: Uint8Array;
  if (entry.method === 0) data = entry.compressed;
  else if (entry.method === 8) data = await inflateRaw(entry.compressed);
  else throw new ZipError(`Unsupported zip compression method ${entry.method} for ${entry.name}`);
  return new TextDecoder("utf-8").decode(data);
}
