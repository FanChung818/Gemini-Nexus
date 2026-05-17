// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('RendererBridge message origin', () => {
    beforeEach(async () => {
        vi.resetModules();
        globalThis.chrome = {
            runtime: {
                getURL: vi.fn((path) => `chrome-extension://id/${path}`),
            },
        };
        await import('./bridge.js');
    });

    it('ignores render responses that do not come from its sandbox iframe', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const bridge = new window.GeminiRendererBridge(host);
        const promise = bridge.render('safe');
        const iframeWindow = host.querySelector('iframe').contentWindow;
        const requestId = Object.keys(bridge.callbacksByRequestId)[0];

        expect(requestId).not.toBe('0');

        window.dispatchEvent(
            new MessageEvent('message', {
                source: window,
                data: {
                    action: 'RENDER_RESULT',
                    reqId: requestId,
                    html: '<img src=x onerror=alert(1)>',
                    fetchTasks: [],
                },
            })
        );
        window.dispatchEvent(
            new MessageEvent('message', {
                source: iframeWindow,
                data: {
                    action: 'RENDER_RESULT',
                    reqId: requestId,
                    html: '<p>safe</p>',
                    fetchTasks: [],
                },
            })
        );

        await expect(promise).resolves.toEqual({ html: '<p>safe</p>', fetchTasks: [] });
    });
});
