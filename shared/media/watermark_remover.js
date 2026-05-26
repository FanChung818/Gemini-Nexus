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
        const imageElement = new Image();
        imageElement.onload = () => resolve(imageElement);
        imageElement.onerror = () =>
            reject(new Error('Unable to load image for watermark removal'));
        imageElement.src = src;
    });
}

function averageSampleColor(canvasContext, x, y) {
    const imageData = canvasContext.getImageData(x, y, SAMPLE_SIZE, SAMPLE_SIZE);
    const { data } = imageData;
    const count = data.length / 4;
    let redTotal = 0;
    let greenTotal = 0;
    let blueTotal = 0;

    for (let colorIndex = 0; colorIndex < data.length; colorIndex += 4) {
        redTotal += data[colorIndex];
        greenTotal += data[colorIndex + 1];
        blueTotal += data[colorIndex + 2];
    }

    return {
        red: Math.floor(redTotal / count),
        green: Math.floor(greenTotal / count),
        blue: Math.floor(blueTotal / count),
    };
}

function coverWatermark(canvasContext, canvas, width, height) {
    const { size, margin } = getWatermarkBox(width, height);
    const watermarkX = width - margin - size;
    const watermarkY = height - margin - size;

    const fillX = Math.max(0, watermarkX - PADDING);
    const fillY = Math.max(0, watermarkY - PADDING);
    const fillW = Math.min(width - fillX, size + PADDING * 2);
    const fillH = Math.min(height - fillY, size + PADDING * 2);
    const sampleY = Math.max(0, fillY - SAMPLE_OFFSET_Y);
    const sampleX = Math.min(fillX, Math.max(0, width - SAMPLE_SIZE));

    const { red, green, blue } = averageSampleColor(canvasContext, sampleX, sampleY);
    canvasContext.fillStyle = `rgb(${red}, ${green}, ${blue})`;
    canvasContext.fillRect(fillX, fillY, fillW, fillH);

    if (fillX > fillW) {
        canvasContext.drawImage(
            canvas,
            fillX - fillW,
            fillY,
            fillW,
            fillH,
            fillX,
            fillY,
            fillW,
            fillH
        );
    }
}

async function removeWatermark(base64Image) {
    const imageElement = await loadImage(base64Image);
    const width = imageElement.width;
    const height = imageElement.height;

    if (!width || !height) return base64Image;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const canvasContext = canvas.getContext('2d', { willReadFrequently: true });
    if (!canvasContext) return base64Image;

    canvasContext.drawImage(imageElement, 0, 0);
    coverWatermark(canvasContext, canvas, width, height);
    return canvas.toDataURL('image/png');
}

export class WatermarkRemover {
    static async process(base64Image) {
        return removeWatermark(base64Image);
    }
}
