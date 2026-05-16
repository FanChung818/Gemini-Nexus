import { describe, expect, it } from 'vitest';
import { ToolDispatcher } from './dispatcher.js';
import { BROWSER_CONTROL_PREAMBLE } from '../handlers/session/prompt/preamble.js';

describe('ToolDispatcher local tool registry', () => {
    it('only exposes core browser automation tools by default', () => {
        const coreAutomationTools = [
            'take_snapshot',
            'click',
            'fill',
            'press_key',
            'navigate_page',
            'new_page',
            'close_page',
            'list_pages',
            'select_page',
            'evaluate_script',
            'attach_file',
        ];

        expect([...ToolDispatcher.LOCAL_TOOL_NAMES].sort()).toEqual(
            [...coreAutomationTools].sort()
        );
    });

    it('does not treat retired browser-control tools as local tools', () => {
        const retiredTools = [
            'run_javascript',
            'run_script',
            'start_trace',
            'stop_trace',
            'get_network_activity',
            'performance_analyze_insight',
            'emulate',
            'fill_form',
            'wait_for',
            'handle_dialog',
        ];

        for (const toolName of retiredTools) {
            expect(ToolDispatcher.isLocalTool(toolName)).toBe(false);
            expect(BROWSER_CONTROL_PREAMBLE).not.toContain(toolName);
        }
    });

    it('does not expose retired diagnostics tools as local browser-control tools', () => {
        const retiredDiagnosticsTools = [
            'performance_start_trace',
            'performance_stop_trace',
            'list_network_requests',
            'get_network_request',
        ];

        for (const toolName of retiredDiagnosticsTools) {
            expect(ToolDispatcher.isLocalTool(toolName)).toBe(false);
            expect(BROWSER_CONTROL_PREAMBLE).not.toContain(toolName);
        }
    });

    it('does not expose visual, debugging, or narrow interaction tools', () => {
        const nonCoreTools = [
            'take_screenshot',
            'resize_page',
            'get_logs',
            'hover',
            'drag_element',
        ];

        for (const toolName of nonCoreTools) {
            expect(ToolDispatcher.isLocalTool(toolName)).toBe(false);
            expect(BROWSER_CONTROL_PREAMBLE).not.toContain(toolName);
        }
    });
});
