import { describe, expect, it, vi } from 'vitest';
import { handleFillForm } from './fill.js';

describe('handleFillForm', () => {
    it('rejects elements without string values before interacting with the page', async () => {
        const handler = {
            getObjectIdFromUid: vi.fn(),
        };

        const result = await handleFillForm(handler, {
            elements: [{ uid: '1_2' }],
        });

        expect(result).toBe("Error: Each form element requires a string 'value'.");
        expect(handler.getObjectIdFromUid).not.toHaveBeenCalled();
    });
});
