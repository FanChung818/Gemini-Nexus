import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WaitForHelper } from './wait_helper.js';

describe('WaitForHelper event waits', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    function createConnection() {
        let listener = null;
        return {
            attached: true,
            addListener: vi.fn((handler) => {
                listener = handler;
            }),
            removeListener: vi.fn((handler) => {
                if (listener === handler) listener = null;
            }),
            emit(method, params = {}) {
                if (listener) listener(method, params);
            },
        };
    }

    it('removes the navigation-start listener after timeout', async () => {
        const connection = createConnection();
        const helper = new WaitForHelper(connection);
        const wait = helper._waitForNavigationStart();

        await vi.advanceTimersByTimeAsync(helper.timeouts.expectNavigationIn);

        await expect(wait).resolves.toBe(false);
        expect(connection.removeListener).toHaveBeenCalledTimes(1);
    });

    it('removes the load-event listener after the event fires', async () => {
        const connection = createConnection();
        const helper = new WaitForHelper(connection);
        const wait = helper._waitForLoadEvent();

        connection.emit('Page.loadEventFired');

        await expect(wait).resolves.toBe(true);
        expect(connection.removeListener).toHaveBeenCalledTimes(1);
    });

    it('does not retain unused multiplier fields after calculating timeouts', () => {
        const connection = createConnection();
        const helper = new WaitForHelper(connection, 2, 3);

        expect(helper.timeouts.stableDom).toBe(6000);
        expect(helper.timeouts.navigation).toBe(45000);
        expect(Object.hasOwn(helper, 'cpuMultiplier')).toBe(false);
        expect(Object.hasOwn(helper, 'networkMultiplier')).toBe(false);
    });

    it('does not expose a runtime multiplier update API when no caller uses one', () => {
        const connection = createConnection();
        const helper = new WaitForHelper(connection);

        expect(helper.updateMultipliers).toBeUndefined();
    });
});
