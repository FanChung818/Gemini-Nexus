import { describe, expect, it } from 'vitest';

import { TemplateIcons } from './icons.js';

describe('TemplateIcons', () => {
    it('centralizes common viewer and project link icons', () => {
        expect(TemplateIcons.DOWNLOAD).toContain('<svg');
        expect(TemplateIcons.GITHUB).toContain('<svg');
        expect(TemplateIcons.RELEASES).toContain('<svg');
        expect(TemplateIcons.ZOOM_IN).toContain('<svg');
        expect(TemplateIcons.ZOOM_OUT).toContain('<svg');
    });
});
