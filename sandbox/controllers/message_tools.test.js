import { describe, expect, it } from 'vitest';

import {
    buildToolOutputHistoryText,
    getToolOutputKey,
    getToolOutputStatus,
    getToolStatusKey,
    hasPersistedToolOutput,
} from './message_tools.js';

describe('message tool helpers', () => {
    it('formats tool output history text with optional step continuation', () => {
        expect(
            buildToolOutputHistoryText({
                toolName: 'search',
                text: 'Found docs',
                step: 2,
            })
        ).toBe('[Tool Output: search]\nFound docs\n\n[Proceeding to step 2]');
    });

    it('builds stable rendered output and status keys', () => {
        const request = {
            sessionId: 'session-1',
            toolName: 'search',
            step: 2,
            callIndex: 1,
            callCount: 3,
            text: 'Found docs',
        };

        expect(getToolOutputKey(request)).toBe('session-1|search|2|1|Found docs');
        expect(getToolStatusKey(request)).toBe('session-1|search|1');
    });

    it('detects persisted tool output and failed output status', () => {
        const request = {
            toolName: 'search',
            text: 'Error executing tool: network',
        };
        const session = {
            messages: [
                {
                    role: 'user',
                    text: '[Tool Output: search]\nError executing tool: network',
                },
            ],
        };

        expect(hasPersistedToolOutput(session, request)).toBe(true);
        expect(getToolOutputStatus(request)).toBe('failed');
    });
});
