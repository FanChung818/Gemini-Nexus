/**
 * Ensures actions wait for potential side effects (navigation) and DOM stability.
 * Enhanced logic based on Chrome DevTools MCP WaitForHelper.
 */
export class WaitForHelper {
    constructor(connection, cpuMultiplier = 1, networkMultiplier = 1) {
        this.connection = connection;
        // Constants derived from MCP implementation logic
        this.timeouts = {
            // Max time to wait for DOM to stabilize
            stableDom: 3000 * cpuMultiplier,
            // Duration of no mutations to consider DOM stable
            stableDomFor: 100 * cpuMultiplier,
            // Time to wait for a navigation to potentially start after an action
            expectNavigationIn: 500 * cpuMultiplier,
            // Max time to wait for navigation to complete
            navigation: 15000 * networkMultiplier,
        };
    }

    /**
     * Executes an action and waits for navigation/DOM stability afterwards.
     * @param {Function} actionFn - Async function performing the browser action
     */
    async execute(actionFn) {
        // Fallback for non-attached sessions (e.g. restricted URLs like chrome://)
        if (!this.connection.attached) {
            await actionFn();
            // Wait a bit for potential navigation to start/process since we can't track it precisely via CDP
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return;
        }

        try {
            await this.connection.sendCommand('Page.enable');
        } catch {
            // The action can still run if Page events are unavailable.
        }

        // Listen before the action so immediate transitions are not missed.
        const navigationStartedPromise = this._waitForNavigationStart();

        try {
            await actionFn();

            const navigationStarted = await navigationStartedPromise;

            if (navigationStarted) {
                await this._waitForLoadEvent();
            }
        } catch (error) {
            console.error('Error during action execution/waiting:', error);
            throw error;
        }

        await this.waitForStableDOM();
    }

    _waitForNavigationStart() {
        return this._waitForEvent(
            (method) =>
                method === 'Page.frameStartedNavigating' ||
                method === 'Page.navigatedWithinDocument',
            this.timeouts.expectNavigationIn
        );
    }

    _waitForLoadEvent() {
        return this._waitForEvent(
            (method) => method === 'Page.loadEventFired',
            this.timeouts.navigation
        );
    }

    _waitForEvent(matchesEvent, timeout) {
        return new Promise((resolve) => {
            let timer = null;

            const listener = (method, params) => {
                if (matchesEvent(method, params)) {
                    cleanup();
                    resolve(true);
                }
            };

            const cleanup = () => {
                this.connection.removeListener(listener);
                if (timer) clearTimeout(timer);
            };

            this.connection.addListener(listener);

            timer = setTimeout(() => {
                cleanup();
                resolve(false);
            }, timeout);
        });
    }

    /**
     * Waits for the DOM to be stable (no mutations) for a certain duration.
     * @param {number} [timeout] - Override max timeout
     * @param {number} [stabilityDuration] - Override stability duration
     */
    async waitForStableDOM(timeout = null, stabilityDuration = null) {
        if (!this.connection.attached) return;

        const maxStableDomWait = timeout || this.timeouts.stableDom;
        const stableDomQuietWindow = stabilityDuration || this.timeouts.stableDomFor;

        try {
            await this.connection.sendCommand('Runtime.evaluate', {
                expression: `
                    (async () => {
                        const startTime = Date.now();

                        while (!document || !document.body) {
                            if (Date.now() - startTime > ${maxStableDomWait}) return false;
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }

                        return await new Promise((resolve) => {
                            let timer = null;

                            const observer = new MutationObserver(() => {
                                // Mutation detected, reset timer
                                if (timer) clearTimeout(timer);
                                timer = setTimeout(done, ${stableDomQuietWindow});
                            });

                            function done() {
                                observer.disconnect();
                                resolve(true);
                            }

                            // Start observing
                            observer.observe(document.body, {
                                attributes: true,
                                childList: true,
                                subtree: true
                            });

                            // Resolve if no mutations happen immediately.
                            timer = setTimeout(done, ${stableDomQuietWindow});

                            // Max safety timeout (deduct time spent waiting for body)
                            const remaining = Math.max(100, ${maxStableDomWait} - (Date.now() - startTime));
                            setTimeout(() => {
                                observer.disconnect();
                                resolve(false);
                            }, remaining);
                        });
                    })()
                `,
                awaitPromise: true,
                returnByValue: true,
            });
        } catch {
            // Ignore errors if runtime context is gone (e.g. page closed or navigated away mid-script)
        }
    }
}
