import { inflateSync } from 'node:zlib';
import { HttpError } from './auth';
const invalid = () => {
  throw new HttpError(
    400,
    'Arquivo incompleto, corrompido ou com dimensões excessivas. Use uma imagem PNG/JPG íntegra de até 12 megapixels e 8192 pixels por lado.',
  );
};
const dimensions = (width: number, height: number) => {
  if (!width || !height || width > 8192 || height > 8192 || width * height > 12000000) invalid();
};
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(bytes: Buffer) {
  let c = 0xffffffff;
  for (const n of bytes) c = crcTable[(c ^ n) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function png(bytes: Buffer) {
  let position = 8,
    width = 0,
    height = 0,
    depth = 0,
    color = 0,
    interlaced = 0,
    ended = false,
    seenData = false,
    closedData = false,
    palette = false,
    chunks = 0;
  const compressed: Buffer[] = [];
  while (position + 12 <= bytes.length) {
    if (++chunks > 10000) invalid();
    const size = bytes.readUInt32BE(position),
      end = position + 12 + size;
    if (end > bytes.length) invalid();
    const kind = bytes.toString('ascii', position + 4, position + 8),
      data = bytes.subarray(position + 8, end - 4);
    if (
      !/^[A-Za-z]{4}$/.test(kind) ||
      crc(bytes.subarray(position + 4, end - 4)) !== bytes.readUInt32BE(end - 4)
    )
      invalid();
    if (chunks === 1 && kind !== 'IHDR') invalid();
    if (kind === 'IHDR') {
      if (chunks !== 1 || size !== 13) invalid();
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      dimensions(width, height);
      depth = data[8];
      color = data[9];
      interlaced = data[12];
      const allowed: Record<number, number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (!allowed[color]?.includes(depth) || data[10] !== 0 || data[11] !== 0 || interlaced > 1)
        invalid();
    } else if (kind === 'PLTE') {
      if (seenData || !size || size % 3 || size > 768) invalid();
      palette = true;
    } else if (kind === 'IDAT') {
      if (closedData || (color === 3 && !palette)) invalid();
      seenData = true;
      compressed.push(data);
    } else if (kind === 'IEND') {
      if (size || !seenData || end !== bytes.length) invalid();
      ended = true;
      position = end;
      break;
    } else {
      if (seenData) closedData = true;
      if (kind[0] === kind[0].toUpperCase()) invalid();
    }
    position = end;
  }
  if (!ended || position !== bytes.length) invalid();
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[color],
    passes = interlaced
      ? [
          [0, 0, 8, 8],
          [4, 0, 8, 8],
          [0, 4, 4, 8],
          [2, 0, 4, 4],
          [0, 2, 2, 4],
          [1, 0, 2, 2],
          [0, 1, 1, 2],
        ]
      : [[0, 0, 1, 1]];
  const rows = passes.map(([x, y, dx, dy]) => {
    const w = Math.max(0, Math.ceil((width - x) / dx)),
      h = Math.max(0, Math.ceil((height - y) / dy));
    return { count: w ? h : 0, size: 1 + Math.ceil((w * channels * depth) / 8) };
  });
  const expected = rows.reduce((n, r) => n + r.count * r.size, 0);
  if (expected > 96 * 1024 * 1024 || !expected) invalid();
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(compressed), { maxOutputLength: expected });
  } catch {
    return invalid();
  }
  if (raw.length !== expected) invalid();
  let offset = 0;
  for (const row of rows)
    for (let i = 0; i < row.count; i++) {
      if (raw[offset] > 4) invalid();
      offset += row.size;
    }
}

/** Validação de estrutura JPEG (marcadores, segmentos, scans e dimensões), sem anunciar sanitização de pixels. */
function jpeg(bytes: Buffer) {
  let position = 2,
    frame = false,
    scan = false,
    quant = false,
    huffman = false,
    segments = 0;
  while (position < bytes.length) {
    if (++segments > 20000 || bytes[position++] !== 255) invalid();
    while (bytes[position] === 255) position++;
    const marker = bytes[position++];
    if (marker === 217) {
      if (!frame || !scan || !quant || !huffman || position !== bytes.length) invalid();
      return;
    }
    if (marker === 216 || marker === 0 || marker === undefined || position + 2 > bytes.length)
      invalid();
    const size = bytes.readUInt16BE(position),
      end = position + size;
    if (size < 2 || end > bytes.length) invalid();
    if ([192, 193, 194].includes(marker)) {
      if (frame || size < 11) invalid();
      const components = bytes[position + 7];
      if (
        ![1, 3, 4].includes(components) ||
        size !== 8 + 3 * components ||
        bytes[position + 2] !== 8
      )
        invalid();
      dimensions(bytes.readUInt16BE(position + 5), bytes.readUInt16BE(position + 3));
      frame = true;
    } else if (marker >= 195 && marker <= 207 && ![196, 200, 204].includes(marker)) invalid();
    if (marker === 219) quant = true;
    if (marker === 196) huffman = true;
    position = end;
    if (marker === 218) {
      if (!frame || size < 8) invalid();
      scan = true;
      const start = position;
      while (position < bytes.length) {
        if (bytes[position] !== 255) {
          position++;
          continue;
        }
        const next = bytes[position + 1];
        if (next === 0 || (next >= 208 && next <= 215)) {
          position += 2;
          continue;
        }
        if (next === 255) {
          position++;
          continue;
        }
        break;
      }
      if (position <= start) invalid();
    }
  }
  invalid();
}

export function validateFileStructure(bytes: Buffer, mime: string) {
  if (mime === 'image/png') return png(bytes);
  if (mime === 'image/jpeg') return jpeg(bytes);
  const content = bytes.toString('latin1');
  // PDF permite escapes #xx nos nomes: /J#61vaScript equivale a /JavaScript.
  // Compare os nomes decodificados, sem interpretar escapes duas vezes.
  const blockedNames = new Set([
    'JavaScript',
    'JS',
    'Launch',
    'EmbeddedFile',
    'OpenAction',
    'RichMedia',
    'XFA',
  ]);
  let activeContent = false;
  for (const match of content.matchAll(/\/([^\s\/<>()[\]{}%\0]+)/g)) {
    const name = match[1].replace(/#([a-f\d]{2})/gi, (_escape, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
    if (blockedNames.has(name)) {
      activeContent = true;
      break;
    }
  }
  // Política proporcional: formato reconhecível e recusa de ações/arquivos ativos; não equivale a antivírus.
  if (
    !/^%PDF-1\.[0-7]\b/.test(content) ||
    !/%\%EOF\s*$/.test(content) ||
    !content.includes(' obj') ||
    activeContent
  )
    throw new HttpError(400, 'PDF incompleto ou com conteúdo ativo não permitido.');
}
