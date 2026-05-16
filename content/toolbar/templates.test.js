import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';

function iconProxy() {
    return new Proxy(
        {},
        {
            get: (_, key) => `<svg data-icon="${String(key)}"></svg>`,
        }
    );
}

async function installTemplates() {
    await import('./templates.js');
}

describe('GeminiToolbarTemplates', () => {
    beforeEach(async () => {
        vi.resetModules();
        const dom = new JSDOM('<!doctype html><html><body></body></html>');
        globalThis.document = dom.window.document;
        globalThis.window = {
            GeminiToolbarIcons: iconProxy(),
            GeminiToolbarStyles: '',
            GeminiWebModels: {
                createOptionMarkup: () => '<option value="gemini-3-pro">Gemini 3 Pro</option>',
            },
            GeminiToolbarStrings: {
                askAi: 'Ask AI',
                copy: 'Copy',
                fixGrammar: 'Fix grammar',
                translate: 'Translate',
                explain: 'Explain',
                summarize: 'Summarize',
                aiTools: 'AI tools',
                chatWithImage: 'Chat with image',
                describeImage: 'Describe image',
                extractText: 'Extract text',
                translateImageText: 'Translate image text',
                imageTools: 'Image tools',
                removeBg: 'Remove background',
                removeText: 'Remove text',
                removeWatermark: 'Remove watermark',
                upscale: 'Upscale',
                expand: 'Expand',
                windowTitle: 'Gemini Nexus',
                close: 'Close',
                askPlaceholder: 'Ask Gemini...',
                retry: 'Retry',
                openSidebar: 'Open in Sidebar',
                chat: 'Chat',
                insertTooltip: 'Insert at cursor',
                insert: 'Insert',
                replaceTooltip: 'Replace selected text',
                replace: 'Replace',
                copyResult: 'Copy result',
                stopGenerating: 'Stop generating',
            },
        };
        await installTemplates();
    });

    it('includes a first-level image text translation menu item', () => {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = window.GeminiToolbarTemplates.mainStructure;

        const item = wrapper.querySelector('#btn-image-translate');

        expect(item).not.toBeNull();
        expect(item.textContent).toContain('Translate image text');
    });
});
