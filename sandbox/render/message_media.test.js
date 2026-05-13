// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createGeneratedImagesGrid, createUserImagesGrid } from './message_media.js';

vi.mock('./generated_image.js', () => ({
    createGeneratedImage: vi.fn((image) => {
        const img = document.createElement('img');
        img.dataset.generatedUrl = image.url;
        return img;
    }),
}));

describe('message media helpers', () => {
    it('creates a user image grid and dispatches view events on click', () => {
        const received = [];
        document.addEventListener(
            'gemini-view-image',
            (event) => {
                received.push(event.detail);
            },
            { once: true }
        );

        const grid = createUserImagesGrid(['data:image/png;base64,a', 'data:image/png;base64,b']);
        const images = grid.querySelectorAll('img');

        expect(grid.className).toBe('user-images-grid');
        expect(images).toHaveLength(2);
        expect(images[0].className).toBe('chat-image');
        expect(images[0].style.maxWidth).toBe('150px');

        images[0].dispatchEvent(new Event('click'));

        expect(received).toEqual(['data:image/png;base64,a']);
    });

    it('returns null for user image input without string sources', () => {
        expect(createUserImagesGrid([{ url: 'not-for-user-grid' }])).toBeNull();
    });

    it('creates a generated image grid from the first generated image object', () => {
        const grid = createGeneratedImagesGrid([
            { url: 'first.png', alt: 'first' },
            { url: 'second.png', alt: 'second' },
        ]);

        expect(grid.className).toBe('generated-images-grid');
        expect(grid.querySelectorAll('img')).toHaveLength(1);
        expect(grid.querySelector('img')?.dataset.generatedUrl).toBe('first.png');
    });

    it('returns null for generated images without object attachments', () => {
        expect(createGeneratedImagesGrid(['data:image/png;base64,a'])).toBeNull();
        expect(createGeneratedImagesGrid([])).toBeNull();
    });
});
