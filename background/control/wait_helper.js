// background/control/wait_helper.js

/**
 * Ensures actions wait for potential side effects (navigation) and DOM stability.
 * Enhanced logic based on Chrome DevTools MCP WaitForHelper.
 */
export class WaitForHelper {
    constructor(connection, cpuMultiplier = 1, networkMultiplier = 1) {
        this.connection = connection;
        this.updateMultipliers(cpuMultiplier, networkMultiplier);
    }

    /**
     * Updates timeout multipliers for emulation.
     * @param {number} cpu - CPU throttling multiplier (default 1)
     * @param {number} network - Network latency multiplier (default 1)
     */
    updateMultipliers(cpu = 1, network = 1) {
        this.cpuMultiplier = cpu;
        this.networkMultiplier = network;

        // Constants derived from MCP implementation logic
        this.timeouts = {
            // Max time to wait for DOM to stabilize
            stableDom: 3000 * cpu,
            // Duration of no mutations to consider DOM stable
            stableDomFor: 100 * cpu,
            // Time to wait for a navigation to potentially start after an action
            expectNavigationIn: 500 * cpu,
            // Max time to wait for navigation to complete
            navigation: 15000 * network,
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
            await new Promise((r) => setTimeout(r, 1000));
            return;
        }

        // Enable Page domain to receive navigation events
        await this.connection.sendCommand('Page.enable').catch(() => {});

        // 1. Setup Navigation Listener (Race Condition Handling)
        // We start listening BEFORE the action to catch immediate transitions
        const navigationStartedPromise = this._waitForNavigationStart();

        try {
            // 2. Perform the Action
            await actionFn();

            // 3. Race: Did navigation start within the timeout window?
            const navStarted = await navigationStartedPromise;

            // 4. If navigation started, wait for it to finish
            if (navStarted) {
                await this._waitForLoadEvent();
            }
        } catch (e) {
            console.error('Error during action execution/waiting:', e);
            throw e;
        }

        // 5. Wait for DOM to settle (MutationObserver)
        await this.waitForStableDOM();
    }

    _waitForNavigationStart() {
        return new Promise((resolve) => {
            let timer = null;

            const listener = (method, params) => {
                if (
                    method === 'Page.frameStartedNavigating' ||
                    method === 'Page.navigatedWithinDocument'
                ) {
                    cleanup();
                    resolve(true);
                }
            };

            const cleanup = () => {
                this.connection.removeListener(listener);
                if (timer) clearTimeout(timer);
            };

            this.connection.addListener(listener);

            // If no navigation happens within the expected window, resolve false
            timer = setTimeout(() => {
                cleanup();
                resolve(false);
            }, this.timeouts.expectNavigationIn);
        });
    }

    _waitForLoadEvent() {
        return new Promise((resolve) => {
            let timer = null;

            const listener = (method, params) => {
                // Wait for load event (lifecycle complete)
                if (method === 'Page.loadEventFired') {
                    cleanup();
                    resolve(true);
                }
            };

            const cleanup = () => {
                this.connection.removeListener(listener);
                if (timer) clearTimeout(timer);
            };

            this.connection.addListener(listener);

            // Max wait for navigation to complete
            timer = setTimeout(() => {
                cleanup();
                resolve(false); // Timed out, but proceed to DOM stability check anyway
            }, this.timeouts.navigation);
        });
    }

    /**
     * Waits for the DOM to be stable (no mutations) for a certain duration.
     * @param {number} [timeout] - Override max timeout
     * @param {number} [stabilityDuration] - Override stability duration
     */
    async waitForStableDOM(timeout = null, stabilityDuration = null) {
        if (!this.connection.attached) return;

        const tMax = timeout || this.timeouts.stableDom;
        const tStable = stabilityDuration || this.timeouts.stableDomFor;

        try {
            await this.connection.sendCommand('Runtime.evaluate', {
                expression: `
                    (async () => {
                        const startTime = Date.now();

                        // 1. Wait for document.body to exist
                        while (!document || !document.body) {
                            if (Date.now() - startTime > ${tMax}) return false;
                            await new Promise(r => setTimeout(r, 100));
                        }

                        // 2. Wait for stability
                        return await new Promise((resolve) => {
                            let timer = null;

                            const observer = new MutationObserver(() => {
                                // Mutation detected, reset timer
                                if (timer) clearTimeout(timer);
                                timer = setTimeout(done, ${tStable});
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

                            // Initial timer (resolve if no mutations happen immediately)
                            timer = setTimeout(done, ${tStable});

                            // Max safety timeout (deduct time spent waiting for body)
                            const remaining = Math.max(100, ${tMax} - (Date.now() - startTime));
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
        } catch (e) {
            // Ignore errors if runtime context is gone (e.g. page closed or navigated away mid-script)
        }
    }
}
