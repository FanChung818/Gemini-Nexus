import { describe, expect, it } from 'vitest';

import {
    collectSharedRootModules,
    collectSiblingModuleDirectoryConflicts,
    ignoredProjectScanPaths,
    collectUnexpectedSourceFilenames,
    countCodeLines,
    exists,
    readProjectFile,
} from './project-structure/helpers.js';

describe('project structure', () => {
    it('uses the repository root as the runnable extension project root', async () => {
        await expect(exists('.github/workflows/package-extension.yml')).resolves.toBe(true);
        await expect(exists('package.json')).resolves.toBe(true);
        await expect(exists('manifest.json')).resolves.toBe(true);
        await expect(exists('gemini-nexus/package.json')).resolves.toBe(false);
    });

    it('uses shared/ for cross-runtime utilities instead of lib/', async () => {
        await expect(exists('shared')).resolves.toBe(true);
        await expect(exists('lib')).resolves.toBe(false);
        await expect(exists('background/lib')).resolves.toBe(false);
    });

    it('groups shared runtime code by capability without root-level compatibility wrappers', async () => {
        const capabilityModules = [
            'shared/attachments/index.js',
            'shared/config/constants.js',
            'shared/dom/crop_utils.js',
            'shared/mcp/transport.js',
            'shared/media/watermark_remover.js',
            'shared/messaging/index.js',
            'shared/models/web_models.js',
            'shared/settings/connection.js',
            'shared/text/tool_call_text.js',
            'shared/ui/copy_feedback.js',
            'shared/utils/index.js',
        ];
        const removedCompatibilityWrappers = [
            'shared/attachments.js',
            'shared/constants.js',
            'shared/crop_utils.js',
            'shared/messaging.js',
            'shared/tool_call_text.js',
            'shared/utils.js',
            'shared/watermark_remover.js',
        ];

        for (const modulePath of capabilityModules) {
            await expect(exists(modulePath)).resolves.toBe(true);
        }

        for (const wrapperPath of removedCompatibilityWrappers) {
            await expect(exists(wrapperPath)).resolves.toBe(false);
        }

        await expect(collectSharedRootModules()).resolves.toEqual([]);
    });

    it('avoids sibling module files that share a name with implementation directories', async () => {
        await expect(collectSiblingModuleDirectoryConflicts()).resolves.toEqual([]);
    });

    it('keeps source filenames aligned with runtime and script naming conventions', async () => {
        await expect(collectUnexpectedSourceFilenames()).resolves.toEqual([]);
    });

    it('keeps local support and generated directories out of structure scans', () => {
        expect(ignoredProjectScanPaths).toEqual(
            expect.arrayContaining([
                '.git',
                'node_modules',
                'dist',
                'artifacts',
                '.superpowers',
                '.trellis',
                'assets/logo-concepts',
            ])
        );
    });

    it('keeps MCP manager helpers split from the connection state machine', async () => {
        const helperModules = [
            'background/managers/mcp/transport.js',
            'background/managers/mcp/tool_result.js',
            'background/managers/mcp/preamble.js',
            'background/managers/mcp/server_tools.js',
            'background/managers/mcp/sse_stream.js',
            'background/managers/mcp/streamable_http.js',
            'background/managers/mcp/rpc_messages.js',
            'background/managers/mcp/tool_listing.js',
        ];

        for (const modulePath of helperModules) {
            await expect(exists(modulePath)).resolves.toBe(true);
        }

        const manager = await readProjectFile('background/managers/mcp_remote_manager.js');
        expect(manager).toContain("from './mcp/transport.js'");
        expect(manager).toContain("from './mcp/tool_result.js'");
        expect(manager).toContain("from './mcp/preamble.js'");
        expect(manager).toContain("from './mcp/server_tools.js'");
        expect(manager).toContain("from './mcp/sse_stream.js'");
        expect(manager).toContain("from './mcp/streamable_http.js'");
        expect(manager).toContain("from './mcp/rpc_messages.js'");
        expect(manager).toContain("from './mcp/tool_listing.js'");
        expect(manager).not.toContain('DEBUG_MCP_REMOTE');
        expect(manager).not.toContain('debugMcpRemote');
        expect(countCodeLines(manager)).toBeLessThan(540);
    });

    it('documents current shared and directory entrypoint conventions', async () => {
        const readme = await readProjectFile('README.md');
        const chineseReadme = await readProjectFile('README.zh-CN.md');

        expect(readme).toContain('shared/ui/');
        await expect(exists('README.zh-CN.md')).resolves.toBe(true);
        expect(readme).toContain('README.zh-CN.md');
        expect(readme).toContain('### Project Overview');
        expect(readme).toContain('### Quick Start');
        expect(readme).toContain(
            'The repository root is the runnable Chrome extension project root.'
        );
        expect(readme).not.toContain('## 中文');
        expect(readme).not.toContain('### 项目简介');
        expect(readme).not.toContain('### 快速开始');
        expect(readme).not.toContain('Project Overview / 项目简介');
        expect(readme).not.toContain('Quick Start / 快速开始');

        expect(chineseReadme).toContain('README.md');
        expect(chineseReadme).toContain('shared/ui/');
        expect(chineseReadme).toContain('### 项目简介');
        expect(chineseReadme).toContain('### 快速开始');
        expect(chineseReadme).toContain('不再保留顶层 `shared/*.js` 兼容入口');
        expect(chineseReadme).toContain('模块目录的聚合入口统一使用目录内 `index.js`');
        expect(chineseReadme).toContain('运行域入口保留为各运行域根部的 `index.js`');
        expect(chineseReadme).toContain('运行时代码文件使用 `snake_case`');
        expect(chineseReadme).not.toContain('## English');
        expect(chineseReadme).not.toContain('### Project Overview');
        expect(chineseReadme).not.toContain('### Quick Start');
    });

    it('keeps sandbox page styles split by UI surface', async () => {
        const sandboxHtml = await readProjectFile('sandbox/index.html');
        const sidepanelHtml = await readProjectFile('sidepanel/index.html');
        const componentStyles = await readProjectFile('css/components.css');
        const chatStyles = await readProjectFile('css/chat.css');
        const inputStyles = await readProjectFile('css/input.css');

        expect(sandboxHtml).toContain('../css/components.css');
        expect(sandboxHtml).toContain('../css/image_viewer.css');
        expect(sandboxHtml).toContain('../css/settings.css');
        expect(sandboxHtml).toContain('../css/settings_controls.css');
        expect(sandboxHtml).toContain('../css/chat_tools.css');
        expect(sandboxHtml).toContain('../css/chat_references.css');
        expect(sandboxHtml).toContain('../css/chat_media.css');
        expect(sandboxHtml).toContain('../css/chat_markdown.css');
        expect(sandboxHtml).toContain('../css/input_attachments.css');
        expect(sandboxHtml).toContain('../css/input_states.css');
        expect(componentStyles).not.toContain('.image-viewer');
        expect(componentStyles).not.toContain('.settings-modal');
        expect(await readProjectFile('css/settings.css')).not.toContain('.setting-help');
        expect(chatStyles).not.toContain('.tool-disclosure');
        expect(chatStyles).not.toContain('.thoughts-container');
        expect(chatStyles).not.toContain('.generated-images-grid');
        expect(chatStyles).not.toContain('.code-block-wrapper');
        expect(inputStyles).not.toContain('.image-preview');
        expect(inputStyles).not.toContain('#status.thinking');
        expect(sidepanelHtml).toContain('href="./index.css"');
        expect(sidepanelHtml).not.toMatch(/<style>/i);
        await expect(exists('sidepanel/index.css')).resolves.toBe(true);
    });

    it('keeps connection settings helpers split from the settings section controller', async () => {
        const helperModules = [
            'sandbox/ui/settings/sections/connection_events.js',
            'sandbox/ui/settings/sections/connection_utils.js',
            'sandbox/ui/settings/sections/mcp_tools_view.js',
        ];

        for (const modulePath of helperModules) {
            await expect(exists(modulePath)).resolves.toBe(true);
        }

        const section = await readProjectFile('sandbox/ui/settings/sections/connection.js');
        expect(section).toContain("from './connection_events.js'");
        expect(section).toContain("from './connection_utils.js'");
        expect(section).toContain("from './mcp_tools_view.js'");
        expect(countCodeLines(section)).toBeLessThan(390);
    });

    it('keeps content toolbar window helpers split from the window controller', async () => {
        const helperModules = ['content/toolbar/view/image_preview.js'];

        for (const modulePath of helperModules) {
            await expect(exists(modulePath)).resolves.toBe(true);
        }

        const windowView = await readProjectFile('content/toolbar/view/window.js');
        expect(windowView).toContain('GeminiImagePreviewController');
        expect(countCodeLines(windowView)).toBeLessThan(300);
    });

    it('keeps message rendering helpers split from the message state controller', async () => {
        const helperModules = [
            'sandbox/render/context_compression.js',
            'sandbox/render/copy_button.js',
            'sandbox/render/message_edit.js',
            'sandbox/render/message_media.js',
            'sandbox/render/sources.js',
        ];

        for (const modulePath of helperModules) {
            await expect(exists(modulePath)).resolves.toBe(true);
        }

        const message = await readProjectFile('sandbox/render/message.js');
        expect(message).toContain("from './content.js'");
        expect(message).toContain("from '../core/displayable_content.js'");
        expect(message).not.toContain('appendContextCompressionNotice');
        expect(message).not.toMatch(/\bfunction hasDisplayable(Text|Thoughts)\s*\(/);
        expect(message).toContain("from './copy_button.js'");
        expect(message).toContain("from './message_edit.js'");
        expect(message).toContain("from './message_media.js'");
        expect(message).toContain("from './sources.js'");
        expect(countCodeLines(message)).toBeLessThan(500);
    });

    it('keeps message result helpers split from the message controller', async () => {
        const helperModules = [
            'sandbox/core/displayable_content.js',
            'sandbox/controllers/message_matchers.js',
            'sandbox/controllers/message_results.js',
            'sandbox/controllers/message_tools.js',
        ];

        for (const modulePath of helperModules) {
            await expect(exists(modulePath)).resolves.toBe(true);
        }

        const handler = await readProjectFile('sandbox/controllers/message_handler.js');
        expect(handler).toContain("from '../core/displayable_content.js'");
        expect(handler).toContain("from './message_matchers.js'");
        expect(handler).toContain("from './message_results.js'");
        expect(handler).toContain("from './message_tools.js'");
        expect(handler).not.toMatch(/^\s{4}buildToolOutputHistoryText\s*\(/m);
        expect(countCodeLines(handler)).toBeLessThan(600);
    });

    it('keeps sidepanel session merge helpers split from the message bridge', async () => {
        await expect(exists('sidepanel/core/session_merge.js')).resolves.toBe(true);

        const bridge = await readProjectFile('sidepanel/core/bridge.js');
        expect(bridge).toContain("from './session_merge.js'");
        expect(bridge).not.toMatch(/\bfunction mergeSessionSaveWithCurrent\s*\(/);
        expect(countCodeLines(bridge)).toBeLessThan(420);
    });
});
