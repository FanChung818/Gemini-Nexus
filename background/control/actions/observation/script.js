import { BaseActionHandler } from '../base.js';

export class ScriptActions extends BaseActionHandler {
    /**
     * Evaluates a script in the browser context.
     * Supports passing arguments (including DOM elements via UIDs).
     */
    async evaluateScript({ script, args = [] }) {
        try {
            const callArguments = [];

            // Resolve UID arguments to CDP object IDs.
            if (args && Array.isArray(args)) {
                for (const arg of args) {
                    if (typeof arg === 'object' && arg !== null && arg.uid) {
                        try {
                            const objectId = await this.getObjectIdFromUid(arg.uid);
                            callArguments.push({ objectId });
                        } catch (error) {
                            return `Error: Could not resolve argument with uid ${arg.uid}: ${error.message}`;
                        }
                    } else {
                        callArguments.push({ value: arg });
                    }
                }
            }

            let functionDeclaration = script.trim();

            const isFunction =
                /^(async\s+)?function\b/.test(functionDeclaration) ||
                /^\(?[\w\s,]*\)?\s*=>/.test(functionDeclaration);

            if (!isFunction) {
                if (/\breturn\b/.test(functionDeclaration)) {
                    functionDeclaration = `async function() { ${functionDeclaration} }`;
                } else {
                    functionDeclaration = `async function() { return (${functionDeclaration}); }`;
                }
            }

            const response = await this.cmd('Runtime.callFunctionOn', {
                functionDeclaration,
                arguments: callArguments,
                executionContextId: undefined, // Default context
                returnByValue: true, // Return JSON result
                awaitPromise: true, // Support async
                userGesture: true,
            });

            if (response.exceptionDetails) {
                const exception = response.exceptionDetails;
                return `Script Exception: ${exception.text} ${exception.exception ? exception.exception.description : ''}`;
            }

            if (response.result) {
                if (response.result.type === 'undefined') return 'undefined';

                const value = response.result.value;
                if (typeof value === 'object' && value !== null) {
                    return JSON.stringify(value, null, 2);
                }
                return String(value);
            }

            return 'undefined';
        } catch (error) {
            return `Error evaluating script: ${error.message}`;
        }
    }
}
