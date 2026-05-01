import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const pngPath = resolve('media/icon.png');
const icoPath = resolve('media/icon.ico');

function assertPng(bytes) {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(pngSignature)) {
    throw new Error(`Invalid PNG file: ${pngPath}`);
  }
}

function readPngDimensions(bytes) {
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return { width, height };
}

function toIco(pngBytes) {
  const { width, height } = readPngDimensions(pngBytes);
  const iconDir = Buffer.alloc(6);
  iconDir.writeUInt16LE(0, 0);
  iconDir.writeUInt16LE(1, 2);
  iconDir.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry.writeUInt8(width >= 256 ? 0 : width, 0);
  entry.writeUInt8(height >= 256 ? 0 : height, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBytes.length, 8);
  entry.writeUInt32LE(iconDir.length + entry.length, 12);

  return Buffer.concat([iconDir, entry, pngBytes]);
}

const pngBytes = await readFile(pngPath);
assertPng(pngBytes);

await mkdir(dirname(icoPath), { recursive: true });
await writeFile(icoPath, toIco(pngBytes));

console.log(`Generated ${icoPath}`);
