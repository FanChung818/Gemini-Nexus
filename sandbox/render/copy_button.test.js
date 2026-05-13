// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createCopyButton } from './copy_button.js';
import { copyToClipboard } from './clipboard.js';

vi.mock('./clipboard.js', () => ({
    copyToClipboard: vi.fn(),
}));

describe('copy button', () => {
    it('copies current text and briefly swaps to the check icon', async () => {
        vi.useFakeTimers();
        copyToClipboard.mockResolvedValue(undefined);

        const button = createCopyButton(() => 'copy me');
        const originalIcon = button.innerHTML;

        button.dispatchEvent(new Event('click'));
        await Promise.resolve();

        expect(copyToClipboard).toHaveBeenCalledWith('copy me');
        expect(button.innerHTML).not.toBe(originalIcon);

        vi.advanceTimersByTime(2000);
        expect(button.innerHTML).toBe(originalIcon);

        vi.useRealTimers();
    });
});
