import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const readCss = (file) => readFile(new URL(file, import.meta.url), 'utf8');

describe('settings layout styles', () => {
    it('keeps modal scrolling vertical and contained', async () => {
        const settingsCss = await readCss('./settings.css');

        expect(settingsCss).toMatch(
            /\.settings-modal\s+\[hidden\]\s*{[^}]*display:\s*none\s*!important/s
        );
        expect(settingsCss).toMatch(/\.settings-content\s*{[^}]*overflow:\s*hidden/s);
        expect(settingsCss).toMatch(/\.settings-content\s*{[^}]*min-height:\s*0/s);
        expect(settingsCss).toMatch(/\.settings-body\s*{[^}]*min-height:\s*0/s);
        expect(settingsCss).toMatch(/\.settings-body\s*{[^}]*overflow-x:\s*hidden/s);
        expect(settingsCss).toMatch(/\.settings-body\s*{[^}]*padding:\s*14px 16px 24px/s);
    });

    it('lets settings form controls override compact shortcut widths', async () => {
        const controlsCss = await readCss('./settings_controls.css');

        expect(controlsCss).toMatch(/\.shortcut-input\.settings-full-input\s*{[^}]*width:\s*100%/s);
        expect(controlsCss).toMatch(/\.shortcut-input\.settings-select\s*{[^}]*width:\s*100%/s);
    });
});
