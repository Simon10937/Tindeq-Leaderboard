import { describe, expect, it } from "vitest";
import { extractCsvFiles } from "./extract-files";

describe("extractCsvFiles", () => {
  it("extracts multiple CSVs from a copied Tindeq ZIP", async () => {
    const zip = makeStoredZip([
      ["raw.csv", "time,weight\n0,1\n"],
      ["summary.csv", "critical force\n120\n"],
      ["notes.txt", "ignored"],
    ]);

    const files = await extractCsvFiles([
      new File([zip], "tindeq-export.zip", { type: "application/zip" }),
    ]);

    expect(files).toHaveLength(2);
    expect(files.map((file) => file.filename)).toEqual([
      "tindeq-export.zip / raw.csv",
      "tindeq-export.zip / summary.csv",
    ]);
    expect(files[0].source).toContain("time,weight");
    expect(files[1].source).toContain("critical force");
  });

  it("extracts deflated CSVs from the ZIP format Tindeq exports", async () => {
    const zip = await makeZip([
      { filename: "info.csv", source: "date,tag\n2026-20-08 19:55:38,rehab half crimp 1.5kg\n", method: 8 },
      { filename: "data_set_1.csv", source: ",Overall Avg\nAvg,0.0\nPeak,0.0\n,\ntime,weight\n0,1\n1,2\n", method: 8 },
    ]);

    const files = await extractCsvFiles([
      new File([zip], "repeaters.zip", { type: "application/zip" }),
    ]);

    expect(files.map((file) => file.filename)).toEqual([
      "repeaters.zip / info.csv",
      "repeaters.zip / data_set_1.csv",
    ]);
    expect(files[1].source).toContain("Overall Avg");
  });
});

function makeStoredZip(entries: readonly (readonly [string, string])[]) {
  return makeZipSync(entries.map(([filename, source]) => ({ filename, source, method: 0, body: new TextEncoder().encode(source) })));
}

async function makeZip(entries: readonly { filename: string; source: string; method: 0 | 8 }[]) {
  const encoded = await Promise.all(entries.map(async (entry) => ({
    ...entry,
    body: entry.method === 8 ? await deflateRaw(entry.source) : new TextEncoder().encode(entry.source),
  })));

  return makeZipSync(encoded);
}

async function deflateRaw(source: string) {
  const body = new TextEncoder().encode(source);
  const compressed = await new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(body);
      controller.close();
    },
  }).pipeThrough(new CompressionStream("deflate-raw" as CompressionFormat))).arrayBuffer();
  return new Uint8Array(compressed);
}

function makeZipSync(entries: readonly { filename: string; source: string; method: 0 | 8; body: Uint8Array }[]) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  for (const { filename, source, method, body } of entries) {
    const name = encoder.encode(filename);
    const localHeader = new Uint8Array(30 + name.length);
    writeUint32(localHeader, 0, 0x04034b50);
    writeUint16(localHeader, 8, 0);
    writeUint16(localHeader, 10, method);
    writeUint32(localHeader, 18, body.length);
    writeUint32(localHeader, 22, encoder.encode(source).length);
    writeUint16(localHeader, 26, name.length);
    localHeader.set(name, 30);

    const centralHeader = new Uint8Array(46 + name.length);
    writeUint32(centralHeader, 0, 0x02014b50);
    writeUint16(centralHeader, 10, method);
    writeUint32(centralHeader, 20, body.length);
    writeUint32(centralHeader, 24, encoder.encode(source).length);
    writeUint16(centralHeader, 28, name.length);
    writeUint32(centralHeader, 42, offset);
    centralHeader.set(name, 46);

    chunks.push(localHeader, body);
    centralDirectory.push(centralHeader);
    offset += localHeader.length + body.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralDirectory.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 8, entries.length);
  writeUint16(end, 10, entries.length);
  writeUint32(end, 12, centralDirectorySize);
  writeUint32(end, 16, centralDirectoryOffset);

  return new Blob([...chunks, ...centralDirectory, end].map(arrayBufferPart), { type: "application/zip" });
}

function arrayBufferPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function writeUint16(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}
