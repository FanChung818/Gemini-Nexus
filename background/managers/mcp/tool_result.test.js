import { describe, expect, it, vi } from 'vitest';
import { normalizeMcpToolResult, summarizeInputSchema } from './tool_result.js';

describe('MCP tool result helpers', () => {
    it('normalizes string and text-content tool results', () => {
        expect(normalizeMcpToolResult('plain')).toEqual({ text: 'plain', files: [] });
        expect(
            normalizeMcpToolResult({
                content: [
                    { type: 'text', text: 'hello' },
                    { type: 'text', text: ' world' },
                ],
            })
        ).toEqual({ text: 'hello world', files: [] });
    });

    it('normalizes image content to data-url files', () => {
        vi.spyOn(Date, 'now').mockReturnValue(1234);

        expect(
            normalizeMcpToolResult({
                content: [{ type: 'image', mimeType: 'image/png', data: 'abc123' }],
            })
        ).toEqual({
            text: '',
            files: [
                {
                    base64: 'data:image/png;base64,abc123',
                    type: 'image/png',
                    name: 'mcp-image-1234.png',
                },
            ],
        });
    });

    it('summarizes required input schema fields', () => {
        expect(
            summarizeInputSchema({
                required: ['url', 'count'],
                properties: {
                    url: { type: 'string' },
                    count: { type: 'number' },
                },
            })
        ).toBe('{ url: string, count: number }');

        expect(summarizeInputSchema({ properties: { optional: { type: 'string' } } })).toBe('{}');
    });
});
