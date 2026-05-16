// shared/media/watermark_remover.js

const SMALL_WATERMARK_SIZE = 48;
const SMALL_WATERMARK_MARGIN = 32;
const LARGE_WATERMARK_SIZE = 96;
const LARGE_WATERMARK_MARGIN = 64;
const PADDING = 4;
const SAMPLE_SIZE = 5;
const SAMPLE_OFFSET_Y = 10;

function getWatermarkBox(width, height) {
    if (width > 1024 && height > 1024) {
        return { size: LARGE_WATERMARK_SIZE, margin: LARGE_WATERMARK_MARGIN };
    }

    return { size: SMALL_WATERMARK_SIZE, margin: SMALL_WATERMARK_MARGIN };
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Unable to load image for watermark removal'));
        img.src = src;
    });
}

function averageSampleColor(ctx, x, y) {
    const imageData = ctx.getImageData(x, y, SAMPLE_SIZE, SAMPLE_SIZE);
    const { data } = imageData;
    const count = data.length / 4;
    let r = 0;
    let g = 0;
    let b = 0;

    for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
    }

    return {
        r: Math.floor(r / count),
        g: Math.floor(g / count),
        b: Math.floor(b / count),
    };
}

function coverWatermark(ctx, canvas, width, height) {
    const { size, margin } = getWatermarkBox(width, height);
    const x = width - margin - size;
    const y = height - margin - size;

    const fillX = Math.max(0, x - PADDING);
    const fillY = Math.max(0, y - PADDING);
    const fillW = Math.min(width - fillX, size + PADDING * 2);
    const fillH = Math.min(height - fillY, size + PADDING * 2);
    const sampleY = Math.max(0, fillY - SAMPLE_OFFSET_Y);
    const sampleX = Math.min(fillX, Math.max(0, width - SAMPLE_SIZE));

    const { r, g, b } = averageSampleColor(ctx, sampleX, sampleY);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(fillX, fillY, fillW, fillH);

    if (fillX > fillW) {
        ctx.drawImage(canvas, fillX - fillW, fillY, fillW, fillH, fillX, fillY, fillW, fillH);
    }
}

async function removeWatermark(base64Image) {
    const img = await loadImage(base64Image);
    const width = img.width;
    const height = img.height;

    if (!width || !height) return base64Image;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return base64Image;

    ctx.drawImage(img, 0, 0);
    coverWatermark(ctx, canvas, width, height);
    return canvas.toDataURL('image/png');
}

export class WatermarkRemover {
    static async process(base64Image) {
        return removeWatermark(base64Image);
    }
}
