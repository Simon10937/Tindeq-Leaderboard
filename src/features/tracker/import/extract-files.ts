export type ExtractedCsvFile = Readonly<{
  filename: string;
  source: string;
  byteSize: number;
}>;

export async function extractCsvFiles(files: readonly File[]): Promise<ExtractedCsvFile[]> {
  const extracted = await Promise.all(files.map((file) => extractCsvFile(file)));
  return extracted.flat();
}

async function extractCsvFile(file: File): Promise<ExtractedCsvFile[]> {
  if (isZipFile(file)) {
    const entries = await extractCsvsFromZip(new Uint8Array(await file.arrayBuffer()));
    return entries.map((entry) => ({
      ...entry,
      filename: `${file.name || "tindeq-export.zip"} / ${entry.filename}`,
    }));
  }

  return [{
    filename: file.name.trim() || "tindeq-export.csv",
    source: await file.text(),
    byteSize: file.size,
  }];
}

function isZipFile(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed";
}

async function extractCsvsFromZip(bytes: Uint8Array): Promise<ExtractedCsvFile[]> {
  const directory = findCentralDirectory(bytes);
  const decoder = new TextDecoder();
  const entries: ExtractedCsvFile[] = [];
  let offset = directory.offset;

  for (let index = 0; index < directory.entries; index += 1) {
    assertSignature(bytes, offset, 0x02014b50, "central directory file header");
    const flags = readUint16(bytes, offset + 8);
    const method = readUint16(bytes, offset + 10);
    const compressedSize = readUint32(bytes, offset + 20);
    const nameLength = readUint16(bytes, offset + 28);
    const extraLength = readUint16(bytes, offset + 30);
    const commentLength = readUint16(bytes, offset + 32);
    const localHeaderOffset = readUint32(bytes, offset + 42);
    const filename = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    if (filename.toLowerCase().endsWith(".csv") && !filename.endsWith("/")) {
      entries.push({
        filename,
        source: decoder.decode(await readZipEntry(bytes, localHeaderOffset, compressedSize, method, flags)),
        byteSize: compressedSize,
      });
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  if (entries.length === 0) throw new Error("The copied ZIP did not contain any CSV files.");
  return entries;
}

function findCentralDirectory(bytes: Uint8Array) {
  const minimumEocdSize = 22;
  const maxCommentLength = 0xffff;
  const start = Math.max(0, bytes.length - minimumEocdSize - maxCommentLength);

  for (let offset = bytes.length - minimumEocdSize; offset >= start; offset -= 1) {
    if (readUint32(bytes, offset) === 0x06054b50) {
      return {
        entries: readUint16(bytes, offset + 10),
        offset: readUint32(bytes, offset + 16),
      };
    }
  }

  throw new Error("The copied ZIP could not be read.");
}

async function readZipEntry(bytes: Uint8Array, localHeaderOffset: number, compressedSize: number, method: number, flags: number) {
  if ((flags & 1) === 1) throw new Error("Encrypted ZIP files are not supported.");

  assertSignature(bytes, localHeaderOffset, 0x04034b50, "local file header");
  const nameLength = readUint16(bytes, localHeaderOffset + 26);
  const extraLength = readUint16(bytes, localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + nameLength + extraLength;
  const compressed = bytes.subarray(dataStart, dataStart + compressedSize);

  if (method === 0) return compressed;
  if (method === 8) return inflateRaw(compressed);
  throw new Error(`ZIP compression method ${method} is not supported.`);
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const Decompression = globalThis.DecompressionStream as typeof DecompressionStream | undefined;
  if (!Decompression) {
    throw new Error("This browser cannot unpack compressed ZIP files. Use Choose Tindeq CSVs for now.");
  }

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  }).pipeThrough(new Decompression("deflate-raw" as CompressionFormat));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function assertSignature(bytes: Uint8Array, offset: number, signature: number, label: string) {
  if (readUint32(bytes, offset) !== signature) throw new Error(`Invalid ZIP ${label}.`);
}

function readUint16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}
