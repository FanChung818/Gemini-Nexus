import { describe, expect, it } from 'vitest';
import {
    DEFAULT_WEB_MODEL,
    WEB_IMAGE_GENERATION_MODEL,
    createWebModelOptionMarkup,
    createWebModelOptions,
    getWebModelHeaderConfig,
} from './web_models.js';

describe('web model metadata', () => {
    it('lists current chat and image-preview models with stable values', () => {
        expect(DEFAULT_WEB_MODEL).toBe('gemini-3-flash');
        expect(WEB_IMAGE_GENERATION_MODEL).toBe('gemini-3-pro-image-preview-11-2025');

        expect(createWebModelOptions()).toEqual([
            { value: 'gemini-3-flash', label: 'Fast' },
            { value: 'gemini-3-flash-thinking', label: 'Thinking' },
            { value: 'gemini-3-pro', label: '3.1 Pro' },
            { value: 'gemini-3.1-flash-image-preview', label: 'Image Fast' },
            { value: 'gemini-3-pro-image-preview-11-2025', label: 'Image Pro' },
        ]);
    });

    it('renders option markup from the same shared model list', () => {
        expect(createWebModelOptionMarkup()).toContain(
            '<option value="gemini-3-pro-image-preview-11-2025">Image Pro</option>'
        );
    });

    it('maps image-preview models to explicit Gemini Web header configs', () => {
        expect(getWebModelHeaderConfig('gemini-3-pro-image-preview-11-2025')).toEqual({
            hash: '56fdd199312815e2',
            mode: 2,
            featureMode: 14,
        });
    });

    it('normalizes legacy model aliases through the public header lookup', () => {
        expect(getWebModelHeaderConfig('gemini-2.5-flash')).toEqual(
            getWebModelHeaderConfig('gemini-3-flash')
        );
    });
});
