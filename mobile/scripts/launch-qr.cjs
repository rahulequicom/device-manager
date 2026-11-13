const { toQR } = require('toqr');
const fs = require('node:fs');
const zlib = require('node:zlib');
const data = toQR(process.argv[2]);
const side = Math.sqrt(data.length), scale = 8, margin = 4;
const size = (side + margin * 2) * scale;
const raw = Buffer.alloc((size * 3 + 1) * size, 255);
for (let y = 0; y < size; y++) {
  raw[y * (size * 3 + 1)] = 0;
  for (let x = 0; x < size; x++) {
    const row = Math.floor(y / scale) - margin, col = Math.floor(x / scale) - margin;
    const dark = row >= 0 && row < side && col >= 0 && col < side && data[row * side + col];
    raw.fill(dark ? 0 : 255, y * (size * 3 + 1) + x * 3 + 1, y * (size * 3 + 1) + x * 3 + 4);
  }
}
function crc(bytes) {
  let value = 0xffffffff;
  for (const b of bytes) { value ^= b; for (let i = 0; i < 8; i++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0); }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes) {
  const result = Buffer.alloc(bytes.length + 12);
  result.writeUInt32BE(bytes.length); result.write(type, 4); bytes.copy(result, 8);
  result.writeUInt32BE(crc(result.subarray(4, bytes.length + 8)), bytes.length + 8);
  return result;
}
const header = Buffer.alloc(13);
header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
fs.mkdirSync('.expo', { recursive: true });
fs.writeFileSync('.expo/launch.png', Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('Launch QR saved to .expo/launch.png');
