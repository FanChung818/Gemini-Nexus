// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const INPUT_DATA_URL = 'data:image/png;base64,target-image';

let mockWidth;
let mockHeight;
let samplePixels;
let fillRectCalls;
let drawImageCalls;
let toDataUrlType;

function installCanvasMocks() {
    const realCreateElement = document.createElement.bind(document);

    class MockImage {
        set src(value) {
            this._src = value;
            this.width = mockWidth;
            this.height = mockHeight;
            queueMicrotask(() => this.onload?.());
        }

        get src() {
            return this._src;
        }
    }

    vi.stubGlobal('Image', MockImage);

    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
        if (tagName !== 'canvas') {
            return realCreateElement(tagName);
        }

        const context = {
            fillStyle: '',
            drawImage: vi.fn((...args) => {
                drawImageCalls.push(args);
            }),
            fillRect: vi.fn((...args) => {
                fillRectCalls.push({ args, fillStyle: context.fillStyle });
            }),
            getImageData: vi.fn((x, y, width, height) => ({
                width,
                height,
                data: new Uint8ClampedArray(samplePixels),
            })),
        };

        return {
            width: 0,
            height: 0,
            getContext: vi.fn(() => context),
            toDataURL: vi.fn((type) => {
                toDataUrlType = type;
                return 'data:image/png;base64,processed';
            }),
        };
    });
}

function makeSamplePixels(rgb) {
    const pixels = new Uint8ClampedArray(5 * 5 * 4);
    for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = rgb[0];
        pixels[i + 1] = rgb[1];
        pixels[i + 2] = rgb[2];
        pixels[i + 3] = 255;
    }
    return pixels;
}

describe('WatermarkRemover', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
        mockWidth = 1200;
        mockHeight = 900;
        samplePixels = makeSamplePixels([16, 32, 48]);
        fillRectCalls = [];
        drawImageCalls = [];
        toDataUrlType = null;
        installCanvasMocks();
    });

    it('covers the Gemini watermark box with the sampled background color', async () => {
        const { WatermarkRemover } = await import('./watermark_remover.js');

        const result = await WatermarkRemover.process(INPUT_DATA_URL);

        expect(result).toBe('data:image/png;base64,processed');
        expect(fillRectCalls).toEqual([
            {
                args: [1116, 816, 56, 56],
                fillStyle: 'rgb(16, 32, 48)',
            },
        ]);
        expect(drawImageCalls[0]).toHaveLength(3);
        expect(drawImageCalls[1]).toEqual([
            expect.any(Object),
            1060,
            816,
            56,
            56,
            1116,
            816,
            56,
            56,
        ]);
        expect(toDataUrlType).toBe('image/png');
    });

    it('uses the larger Gemini watermark box for images over 1024px in both dimensions', async () => {
        mockWidth = 1536;
        mockHeight = 1536;
        const { WatermarkRemover } = await import('./watermark_remover.js');

        await WatermarkRemover.process(INPUT_DATA_URL);

        expect(fillRectCalls[0].args).toEqual([1372, 1372, 104, 104]);
    });
});
