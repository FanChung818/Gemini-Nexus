import { beforeEach, describe, expect, it, vi } from 'vitest';
import { keepAliveManager } from './keep_alive.js';

describe('KeepAliveManager alarm listener', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        keepAliveManager.lastRotation = Date.now();
        keepAliveManager.isRotating = false;
        keepAliveManager.consecutiveErrors = 0;

        const listeners = new Set();
        globalThis.chrome = {
            alarms: {
                get: vi.fn((name, callback) => callback({ name })),
                create: vi.fn(),
                onAlarm: {
                    hasListener: vi.fn((listener) => listeners.has(listener)),
                    addListener: vi.fn((listener) => listeners.add(listener)),
                },
            },
        };
    });

    it('does not add duplicate alarm listeners across repeated init calls', () => {
        keepAliveManager.init();
        keepAliveManager.init();

        expect(chrome.alarms.onAlarm.addListener).toHaveBeenCalledTimes(1);
    });
});
