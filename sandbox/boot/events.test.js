// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindAppEvents, getToolsPageScrollDistance } from './events.js';

vi.mock('../../shared/messaging/index.js', () => ({
    sendToBackground: vi.fn(),
}));

function installFooterDom() {
    document.body.innerHTML = `
        <button id="new-chat-header-btn"></button>
        <button id="tab-switcher-btn"></button>
        <button id="open-full-page-btn"></button>
        <div class="tools-container">
            <button id="tools-scroll-left"></button>
            <div id="tools-row">
                <button id="browser-control-btn"></button>
                <button id="quote-btn"></button>
                <button id="ocr-btn"></button>
                <button id="screenshot-translate-btn"></button>
                <button id="screen-capture-btn"></button>
                <button id="snip-btn"></button>
                <button id="page-context-btn"></button>
            </div>
            <button id="tools-scroll-right"></button>
        </div>
        <select id="model-select"><option value="a">A</option></select>
        <textarea id="prompt"></textarea>
        <button id="send"></button>
    `;
    document.getElementById('tools-row').scrollBy = vi.fn();
}

describe('app events', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        installFooterDom();
        window.parent.postMessage = vi.fn();
        window.requestAnimationFrame = (callback) => {
            callback();
            return 1;
        };
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    it('requests the independent screen-capture mode from the parent bridge', () => {
        const app = {
            handleNewChat: vi.fn(),
            handleTabSwitcher: vi.fn(),
            toggleBrowserControl: vi.fn(),
            setCaptureMode: vi.fn(),
            togglePageContext: vi.fn(),
            handleModelChange: vi.fn(),
            handleSendMessage: vi.fn(),
            isGenerating: false,
        };
        const ui = {
            inputFn: document.getElementById('prompt'),
            updateStatus: vi.fn(),
        };

        bindAppEvents(app, ui);
        document.getElementById('screen-capture-btn').click();

        expect(app.setCaptureMode).toHaveBeenCalledWith('screen_capture');
        expect(window.parent.postMessage).toHaveBeenCalledWith(
            { action: 'REQUEST_SCREEN_CAPTURE' },
            '*'
        );
        expect(ui.updateStatus).toHaveBeenCalledWith('Choose a screen or window to capture...');
    });

    it('uses a page-sized distance for tools row navigation', () => {
        expect(getToolsPageScrollDistance({ clientWidth: 320 })).toBe(296);
        expect(getToolsPageScrollDistance({ clientWidth: 120 })).toBe(160);
    });

    it('scrolls the tools row by one visible page when using navigation buttons', () => {
        const toolsRow = document.getElementById('tools-row');
        Object.defineProperty(toolsRow, 'clientWidth', {
            value: 320,
            configurable: true,
        });
        Object.defineProperty(toolsRow, 'scrollWidth', {
            value: 720,
            configurable: true,
        });

        const app = {
            handleNewChat: vi.fn(),
            handleTabSwitcher: vi.fn(),
            toggleBrowserControl: vi.fn(),
            setCaptureMode: vi.fn(),
            togglePageContext: vi.fn(),
            handleModelChange: vi.fn(),
            handleSendMessage: vi.fn(),
            isGenerating: false,
        };
        const ui = {
            inputFn: document.getElementById('prompt'),
            updateStatus: vi.fn(),
        };

        bindAppEvents(app, ui);
        document.getElementById('tools-scroll-right').click();

        expect(toolsRow.scrollBy).toHaveBeenCalledWith({ left: 296, behavior: 'smooth' });
    });
});
