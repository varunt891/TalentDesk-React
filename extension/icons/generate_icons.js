import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createPNG(width, height, r, g, b, a) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    
    // IHDR
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData[8] = 8; // Bit depth
    ihdrData[9] = 6; // Color type (RGBA)
    ihdrData[10] = 0; // Compression
    ihdrData[11] = 0; // Filter
    ihdrData[12] = 0; // Interlace
    const ihdrChunk = makeChunk('IHDR', ihdrData);
    
    // Raw scanlines
    const rowSize = width * 4 + 1;
    const rawScanlines = Buffer.alloc(height * rowSize);
    
    for (let y = 0; y < height; y++) {
        const offset = y * rowSize;
        rawScanlines[offset] = 0; // None filter
        for (let x = 0; x < width; x++) {
            const pxOffset = offset + 1 + x * 4;
            const isBorder = (x === 0 || y === 0 || x === width - 1 || y === height - 1);
            if (isBorder && width > 16) {
                rawScanlines[pxOffset] = 13;
                rawScanlines[pxOffset + 1] = 148;
                rawScanlines[pxOffset + 2] = 136;
                rawScanlines[pxOffset + 3] = 255;
            } else {
                rawScanlines[pxOffset] = r;
                rawScanlines[pxOffset + 1] = g;
                rawScanlines[pxOffset + 2] = b;
                rawScanlines[pxOffset + 3] = a;
            }
        }
    }
    
    const idatCompressed = zlib.deflateSync(rawScanlines);
    const idatChunk = makeChunk('IDAT', idatCompressed);
    const iendChunk = makeChunk('IEND', Buffer.alloc(0));
    
    return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    
    const crcVal = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crcVal >>> 0, 0);
    
    return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
            if (crc & 1) {
                crc = (crc >>> 1) ^ 0xEDB88320;
            } else {
                crc = crc >>> 1;
            }
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

const sizes = [16, 48, 128];
sizes.forEach(size => {
    const pngBuf = createPNG(size, size, 13, 148, 136, 255);
    const filePath = path.join(__dirname, `icon-${size}.png`);
    fs.writeFileSync(filePath, pngBuf);
    console.log(`Generated ${filePath}`);
});
