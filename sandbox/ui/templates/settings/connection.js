export const ConnectionSettingsTemplate = `
<div class="setting-group">
    <h4 data-i18n="connection">Connection</h4>

    <div class="setting-compact-block">
        <label class="setting-label" data-i18n="connectionProvider">Model Provider</label>
        <select id="provider-select" class="shortcut-input settings-select relaxed">
            <option value="web" data-i18n="providerWeb">Gemini Web Client (Free)</option>
            <option value="official" data-i18n="providerOfficial">Google Gemini API</option>
            <option value="openai" data-i18n="providerOpenAI">OpenAI Compatible API</option>
        </select>
    </div>

    <div id="api-key-container" class="settings-stack settings-api-key-panel" hidden>
        <!-- Official API Fields -->
        <div id="official-fields" class="settings-stack" hidden>
            <div>
                <label data-i18n="baseUrl" class="settings-field-label">Base URL</label>
                <input type="text" id="official-base-url" class="shortcut-input settings-full-input" data-i18n-placeholder="officialBaseUrlPlaceholder" placeholder="https://generativelanguage.googleapis.com/v1beta">
            </div>
            <div>
                <label data-i18n="apiKey" class="settings-field-label">API Key</label>
                <input type="password" id="api-key-input" class="shortcut-input settings-full-input" data-i18n-placeholder="apiKeyPlaceholder" placeholder="Paste your Gemini API Key">
            </div>
            <div>
                <label data-i18n="modelIds" class="settings-field-label">Model IDs</label>
                <input type="text" id="official-model" class="shortcut-input settings-full-input" data-i18n-placeholder="officialModelPlaceholder" placeholder="gemini-3-flash-preview, gemini-3.1-pro-preview">
            </div>
            <div>
                <label data-i18n="thinkingLevelGemini3" class="settings-field-label">Thinking Level (Gemini 3)</label>
                <select id="thinking-level-select" class="shortcut-input settings-select">
                    <option value="minimal" data-i18n="thinkingMinimalFlashOnly">Minimal (Flash Only)</option>
                    <option value="low" data-i18n="thinkingLowFaster">Low (Faster)</option>
                    <option value="medium" data-i18n="thinkingMediumBalanced">Medium (Balanced)</option>
                    <option value="high" data-i18n="thinkingHighDeepReasoning">High (Deep Reasoning)</option>
                </select>
            </div>
            <label class="settings-inline-row">
                <input type="checkbox" id="official-web-search-enabled" />
                <span data-i18n="officialWebSearch">Enable Google Search grounding</span>
            </label>
        </div>

        <!-- OpenAI Fields -->
        <div id="openai-fields" class="settings-stack" hidden>
            <div>
                <label data-i18n="baseUrl" class="settings-field-label">Base URL</label>
                <input type="text" id="openai-base-url" class="shortcut-input settings-full-input" data-i18n-placeholder="baseUrlPlaceholder" placeholder="https://api.openai.com/v1">
            </div>
            <div>
                <label data-i18n="apiKey" class="settings-field-label">API Key</label>
                <input type="password" id="openai-api-key" class="shortcut-input settings-full-input" data-i18n-placeholder="apiKeyPlaceholder" placeholder="sk-...">
            </div>
            <div>
                <label data-i18n="modelIdsCommaSeparated" class="settings-field-label">Model IDs (Comma separated)</label>
                <input type="text" id="openai-model" class="shortcut-input settings-full-input" data-i18n-placeholder="modelIdPlaceholder" placeholder="e.g. gpt-4o, claude-3-5-sonnet">
            </div>
            <div>
                <label data-i18n="thinkingLevel" class="settings-field-label">Thinking Level</label>
                <select id="openai-thinking-level-select" class="shortcut-input settings-select">
                    <option value="minimal" data-i18n="thinkingMinimal">Minimal</option>
                    <option value="low" data-i18n="thinkingLow">Low</option>
                    <option value="medium" data-i18n="thinkingMedium">Medium</option>
                    <option value="high" data-i18n="thinkingHigh">High</option>
                </select>
            </div>
            <div class="settings-stack tight">
                <label class="settings-inline-row">
                    <input type="checkbox" id="openai-use-responses-api" />
                    <span data-i18n="openaiUseResponsesApi">Use Responses API</span>
                </label>
                <label class="settings-inline-row">
                    <input type="checkbox" id="openai-web-search-enabled" />
                    <span data-i18n="openaiWebSearch">Enable OpenAI API web search</span>
                </label>
            </div>
        </div>
    </div>

    <div class="setting-panel">
        <div class="mcp-summary-row settings-split-row">
            <div>
                <div class="setting-label">
                    <span data-i18n="mcpTools">External MCP Tools</span>
                    <button type="button" class="setting-help" aria-label="Help" data-i18n-title="mcpToolsDesc" title="Connect to a local/remote MCP server and use its tools in chat.">?</button>
                </div>
            </div>
            <label class="setting-inline-toggle settings-inline-row">
                <input type="checkbox" id="mcp-enabled" />
                <span data-i18n="enabled">Enabled</span>
            </label>
        </div>

        <div id="mcp-fields" class="settings-stack settings-section-offset" hidden>
            <div>
                <label data-i18n="mcpActiveServer" class="settings-field-label spacious">Active Server</label>
                <div class="settings-action-row">
                    <select id="mcp-server-select" class="shortcut-input settings-select settings-flex-fill"></select>
                    <button id="mcp-add-server" class="tool-btn settings-small-button" type="button" data-i18n="mcpAddServer">Add</button>
                    <button id="mcp-remove-server" class="tool-btn settings-small-button" type="button" data-i18n="mcpRemoveServer">Remove</button>
                </div>
            </div>

            <div>
                <label data-i18n="mcpServerName" class="settings-field-label">Name</label>
                <input type="text" id="mcp-server-name" class="shortcut-input settings-full-input" placeholder="Local Proxy">
            </div>
            <div>
                <label data-i18n="mcpTransport" class="settings-field-label">Transport</label>
                <select id="mcp-transport" class="shortcut-input settings-select">
                    <option value="streamable-http">Streamable HTTP (official, http://.../mcp)</option>
                    <option value="sse">SSE (http://.../sse)</option>
                    <option value="ws">Custom WebSocket (non-standard, ws://)</option>
                </select>
            </div>
            <div>
                <label data-i18n="mcpServerUrl" class="settings-field-label">Server URL</label>
                <input type="text" id="mcp-server-url" class="shortcut-input settings-full-input" placeholder="http://127.0.0.1:3006/mcp">
            </div>
            <div>
                <label data-i18n="mcpHeaders" class="settings-field-label">Request Headers (JSON)</label>
                <textarea id="mcp-headers" class="shortcut-input settings-full-input settings-monospace-textarea" data-i18n-placeholder="mcpHeadersPlaceholder" placeholder='{"Authorization":"Bearer xxx"}'></textarea>
                <button type="button" class="setting-help setting-help-after-field" aria-label="Help" data-i18n-title="mcpHeadersDesc" title="Optional JSON object. Applied to SSE and Streamable HTTP requests.">?</button>
            </div>
            <div class="settings-split-row">
                <label class="setting-inline-toggle settings-inline-row">
                    <input type="checkbox" id="mcp-server-enabled" />
                    <span data-i18n="enabled">Enabled</span>
                </label>
                <button id="mcp-test-connection" class="tool-btn settings-small-button" type="button" data-i18n="mcpTestConnection">Test</button>
            </div>
            <div id="mcp-test-status" class="settings-muted-text"></div>

            <div class="settings-stack compact settings-panel-fieldset">
                <div>
                    <label data-i18n="mcpToolMode" class="settings-field-label spacious">Expose Tools</label>
                    <select id="mcp-tool-mode" class="shortcut-input settings-select">
                        <option value="all" data-i18n="mcpToolModeAll">All tools (default)</option>
                        <option value="selected" data-i18n="mcpToolModeSelected">Selected tools only</option>
                    </select>
                </div>

                <div class="mcp-action-row settings-action-row">
                    <button id="mcp-refresh-tools" class="tool-btn settings-small-button" type="button" data-i18n="mcpRefreshTools">Refresh Tools</button>
                    <button id="mcp-enable-all-tools" class="tool-btn settings-small-button" type="button" data-i18n="mcpEnableAllTools">Enable All</button>
                    <button id="mcp-disable-all-tools" class="tool-btn settings-small-button" type="button" data-i18n="mcpDisableAllTools">Disable All</button>
                </div>

                <input type="text" id="mcp-tool-search" class="shortcut-input settings-full-input" data-i18n-placeholder="mcpToolSearchPlaceholder" placeholder="Search tools...">

                <div id="mcp-tools-summary" class="settings-muted-text"></div>

                <div id="mcp-tool-list" class="mcp-tool-list"></div>
            </div>
        </div>
    </div>
</div>`;
