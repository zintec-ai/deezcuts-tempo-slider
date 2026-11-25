// Generates the placeholder PNG icons in tempo_core/icons/.
// The icon is an orange rounded square with a white fader (a vertical
// track and a horizontal knob). Replace the icons with real artwork
// before you publish. Run: npm run icons
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function pixel(x, y, s) {
  // Coordinates in 0..1. Returns [r, g, b, a].
  const u = (x + 0.5) / s, v = (y + 0.5) / s;
  const r = 0.2; // corner radius
  const cx = Math.min(Math.max(u, r), 1 - r), cy = Math.min(Math.max(v, r), 1 - r);
  if ((u - cx) ** 2 + (v - cy) ** 2 > r * r) return [0, 0, 0, 0];
  const white = [255, 255, 255, 255];
  if (Math.abs(u - 0.5) < 0.05 && v > 0.15 && v < 0.85) return white; // track
  if (Math.abs(u - 0.5) < 0.25 && Math.abs(v - 0.4) < 0.08) return white; // knob
  return [255, 85, 0, 255];
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      raw.set(pixel(x, y, size), y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const dir = new URL("../tempo_core/icons/", import.meta.url);
mkdirSync(dir, { recursive: true });
for (const s of [16, 32, 48, 128]) writeFileSync(new URL(`icon${s}.png`, dir), png(s));
console.log("icons written to tempo_core/icons/");
