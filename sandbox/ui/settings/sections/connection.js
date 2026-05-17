import {
    DEFAULT_MCP_TRANSPORT,
    DEFAULT_OFFICIAL_BASE_URL,
    DEFAULT_OFFICIAL_MODELS,
    DEFAULT_PROVIDER,
    DEFAULT_THINKING_LEVEL,
} from '../../../../shared/config/constants.js';
import {
    createDefaultMcpServer,
    getDefaultMcpUrlForTransport,
} from '../../../../shared/settings/connection.js';
import {
    formatMcpHeaders,
    inferMcpTransport,
    normalizeMcpHeaders,
    normalizeOpenAISettings,
    parseMcpHeadersText,
} from './connection_utils.js';
import { bindConnectionSectionEvents } from './connection_events.js';
import { renderMcpToolsUI } from './mcp_tools_view.js';
import { t } from '../../../core/i18n.js';

export class ConnectionSection {
    constructor() {
        this.elements = {};
        this.mcpServers = [];
        this.mcpActiveServerId = null;
        this.mcpToolsCache = new Map(); // serverId -> { key, tools }
        this.mcpToolsUiState = new Map(); // serverId -> { openGroups: Set<string> }
        this.queryElements();
        this.bindEvents();
    }

    _makeServerId() {
        return `srv_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }

    _getDefaultServer() {
        return createDefaultMcpServer(this._makeServerId());
    }

    _getDefaultUrlForTransport(transport) {
        return getDefaultMcpUrlForTransport(transport);
    }

    queryElements() {
        const get = (id) => document.getElementById(id);
        this.elements = {
            providerSelect: get('provider-select'),
            apiKeyContainer: get('api-key-container'),

            // Official Fields
            officialFields: get('official-fields'),
            officialBaseUrl: get('official-base-url'),
            apiKeyInput: get('api-key-input'),
            officialModel: get('official-model'),
            thinkingLevelSelect: get('thinking-level-select'),
            officialWebSearchEnabled: get('official-web-search-enabled'),

            // OpenAI Fields
            openaiFields: get('openai-fields'),
            openaiBaseUrl: get('openai-base-url'),
            openaiApiKey: get('openai-api-key'),
            openaiModel: get('openai-model'),
            openaiThinkingLevelSelect: get('openai-thinking-level-select'),
            openaiUseResponsesApi: get('openai-use-responses-api'),
            openaiWebSearch: get('openai-web-search-enabled'),

            // MCP Fields
            mcpEnabled: get('mcp-enabled'),
            mcpFields: get('mcp-fields'),
            mcpServerSelect: get('mcp-server-select'),
            mcpAddServer: get('mcp-add-server'),
            mcpRemoveServer: get('mcp-remove-server'),
            mcpServerName: get('mcp-server-name'),
            mcpTransport: get('mcp-transport'),
            mcpServerUrl: get('mcp-server-url'),
            mcpHeaders: get('mcp-headers'),
            mcpServerEnabled: get('mcp-server-enabled'),
            mcpTestConnection: get('mcp-test-connection'),
            mcpTestStatus: get('mcp-test-status'),
            mcpToolMode: get('mcp-tool-mode'),
            mcpRefreshTools: get('mcp-refresh-tools'),
            mcpEnableAllTools: get('mcp-enable-all-tools'),
            mcpDisableAllTools: get('mcp-disable-all-tools'),
            mcpToolSearch: get('mcp-tool-search'),
            mcpToolsSummary: get('mcp-tools-summary'),
            mcpToolList: get('mcp-tool-list'),
        };
    }

    bindEvents() {
        bindConnectionSectionEvents(this);
    }

    setData(data) {
        const {
            providerSelect,
            officialBaseUrl,
            apiKeyInput,
            officialModel,
            thinkingLevelSelect,
            officialWebSearchEnabled,
            openaiBaseUrl,
            openaiApiKey,
            openaiModel,
            openaiThinkingLevelSelect,
            openaiUseResponsesApi,
            openaiWebSearch,
            mcpEnabled,
        } = this.elements;

        // Provider
        if (providerSelect) {
            providerSelect.value = data.provider || DEFAULT_PROVIDER;
            this.updateVisibility(data.provider || DEFAULT_PROVIDER);
        }

        // Official
        if (officialBaseUrl)
            officialBaseUrl.value = data.officialBaseUrl || DEFAULT_OFFICIAL_BASE_URL;
        if (apiKeyInput) apiKeyInput.value = data.apiKey || '';
        if (officialModel) officialModel.value = data.officialModel || DEFAULT_OFFICIAL_MODELS;
        if (thinkingLevelSelect)
            thinkingLevelSelect.value = data.thinkingLevel || DEFAULT_THINKING_LEVEL;
        if (officialWebSearchEnabled)
            officialWebSearchEnabled.checked = data.officialWebSearch === true;

        // OpenAI
        if (openaiBaseUrl) openaiBaseUrl.value = data.openaiBaseUrl || '';
        if (openaiApiKey) openaiApiKey.value = data.openaiApiKey || '';
        if (openaiModel) openaiModel.value = data.openaiModel || '';
        if (openaiThinkingLevelSelect)
            openaiThinkingLevelSelect.value = data.openaiThinkingLevel || DEFAULT_THINKING_LEVEL;
        const openaiSettings = normalizeOpenAISettings(data);
        if (openaiUseResponsesApi) openaiUseResponsesApi.checked = openaiSettings.useResponsesApi;
        if (openaiWebSearch) openaiWebSearch.checked = openaiSettings.webSearch;

        // MCP
        if (mcpEnabled) {
            mcpEnabled.checked = data.mcpEnabled === true;
            this.updateMcpVisibility(mcpEnabled.checked);
        }

        // Servers list (preferred)
        const servers = Array.isArray(data.mcpServers) ? data.mcpServers : null;
        const activeId = typeof data.mcpActiveServerId === 'string' ? data.mcpActiveServerId : null;

        if (servers && servers.length > 0) {
            this.mcpServers = servers.map((s) => ({
                id: s.id || this._makeServerId(),
                name: s.name || '',
                transport: s.transport || DEFAULT_MCP_TRANSPORT,
                url: s.url || '',
                headers: normalizeMcpHeaders(s.headers),
                enabled: s.enabled !== false,
                toolMode: s.toolMode === 'selected' ? 'selected' : 'all',
                enabledTools: Array.isArray(s.enabledTools) ? s.enabledTools : [],
            }));
            this.mcpActiveServerId =
                activeId && this.mcpServers.some((s) => s.id === activeId)
                    ? activeId
                    : this.mcpServers[0].id;
        } else {
            // Legacy single server fields
            const legacyUrl = data.mcpServerUrl || '';
            const legacyTransport = data.mcpTransport || DEFAULT_MCP_TRANSPORT;
            const server = this._getDefaultServer();
            server.transport = legacyTransport;
            server.url = legacyUrl || server.url;
            server.headers = normalizeMcpHeaders(data.mcpHeaders);
            server.enabled = data.mcpEnabled === true;
            this.mcpServers = [server];
            this.mcpActiveServerId = server.id;
        }

        this._renderMcpServerOptions();
        this._loadActiveServerIntoForm();
        this.setMcpTestStatus('');
    }

    getData() {
        const {
            providerSelect,
            officialBaseUrl,
            apiKeyInput,
            officialModel,
            thinkingLevelSelect,
            officialWebSearchEnabled,
            openaiBaseUrl,
            openaiApiKey,
            openaiModel,
            openaiThinkingLevelSelect,
            openaiUseResponsesApi,
            openaiWebSearch,
            mcpEnabled,
        } = this.elements;

        this._saveCurrentServerEdits();
        const servers = Array.isArray(this.mcpServers) ? this.mcpServers : [];
        // Get the first enabled server for legacy compatibility
        const firstEnabled = servers.find((s) => s.enabled !== false && s.url && s.url.trim());

        return {
            provider: providerSelect ? providerSelect.value : DEFAULT_PROVIDER,
            // Official
            officialBaseUrl: officialBaseUrl
                ? officialBaseUrl.value.trim()
                : DEFAULT_OFFICIAL_BASE_URL,
            apiKey: apiKeyInput ? apiKeyInput.value.trim() : '',
            officialModel: officialModel ? officialModel.value.trim() : DEFAULT_OFFICIAL_MODELS,
            thinkingLevel: thinkingLevelSelect ? thinkingLevelSelect.value : DEFAULT_THINKING_LEVEL,
            officialWebSearch: officialWebSearchEnabled
                ? officialWebSearchEnabled.checked === true
                : false,
            // OpenAI
            openaiBaseUrl: openaiBaseUrl ? openaiBaseUrl.value.trim() : '',
            openaiApiKey: openaiApiKey ? openaiApiKey.value.trim() : '',
            openaiModel: openaiModel ? openaiModel.value.trim() : '',
            openaiThinkingLevel: openaiThinkingLevelSelect
                ? openaiThinkingLevelSelect.value
                : DEFAULT_THINKING_LEVEL,
            openaiUseResponsesApi: openaiUseResponsesApi
                ? openaiUseResponsesApi.checked === true
                : false,
            openaiWebSearch: openaiWebSearch ? openaiWebSearch.checked === true : false,

            // MCP - Multi-server mode: all enabled servers will be used
            mcpEnabled: mcpEnabled ? mcpEnabled.checked === true : false,
            mcpServers: servers,
            // Keep mcpActiveServerId for backward compatibility but it's no longer required
            mcpActiveServerId: this.mcpActiveServerId || (servers[0] ? servers[0].id : null),

            // Legacy fields for single-server backward compatibility
            mcpTransport: firstEnabled
                ? firstEnabled.transport || DEFAULT_MCP_TRANSPORT
                : DEFAULT_MCP_TRANSPORT,
            mcpServerUrl: firstEnabled ? firstEnabled.url || '' : '',
        };
    }

    updateVisibility(provider) {
        const { apiKeyContainer, officialFields, openaiFields } = this.elements;
        if (!apiKeyContainer) return;

        if (provider === 'web') {
            apiKeyContainer.hidden = true;
        } else {
            apiKeyContainer.hidden = false;
            if (provider === 'official') {
                if (officialFields) officialFields.hidden = false;
                if (openaiFields) openaiFields.hidden = true;
            } else if (provider === 'openai') {
                if (officialFields) officialFields.hidden = true;
                if (openaiFields) openaiFields.hidden = false;
            }
        }
    }

    updateMcpVisibility(enabled) {
        const { mcpFields } = this.elements;
        if (!mcpFields) return;
        mcpFields.hidden = !enabled;
    }

    _getActiveServer() {
        if (!this.mcpServers || this.mcpServers.length === 0) return null;
        const activeId = this.mcpActiveServerId;
        const match = activeId ? this.mcpServers.find((s) => s.id === activeId) : null;
        return match || this.mcpServers[0];
    }

    _saveCurrentServerEdits() {
        const {
            mcpServerName,
            mcpTransport,
            mcpServerUrl,
            mcpHeaders,
            mcpServerEnabled,
            mcpToolMode,
        } = this.elements;

        const server = this._getActiveServer();
        if (!server) return false;

        const prevKey = this._serverKey(server);

        if (mcpServerName) server.name = mcpServerName.value || '';
        if (mcpServerUrl) server.url = (mcpServerUrl.value || '').trim();
        if (mcpTransport)
            server.transport = inferMcpTransport(mcpTransport.value || 'sse', server.url);
        if (mcpHeaders) {
            try {
                server.headers = parseMcpHeadersText(mcpHeaders.value);
                this.setMcpTestStatus('');
            } catch (error) {
                this.setMcpTestStatus(error.message || t('mcpConnectionFailed'), true);
                return false;
            }
        }
        if (mcpServerEnabled) server.enabled = mcpServerEnabled.checked === true;
        if (mcpToolMode) server.toolMode = mcpToolMode.value === 'selected' ? 'selected' : 'all';

        // If transport/url changed, invalidate cached tool list for this server.
        const nextKey = this._serverKey(server);
        if (prevKey !== nextKey) {
            this.mcpToolsCache.delete(server.id);
        }
        return true;
    }

    _loadActiveServerIntoForm() {
        const {
            mcpServerSelect,
            mcpServerName,
            mcpTransport,
            mcpServerUrl,
            mcpHeaders,
            mcpServerEnabled,
            mcpToolMode,
        } = this.elements;

        const server = this._getActiveServer();
        if (!server) return;

        if (mcpServerSelect) mcpServerSelect.value = server.id;
        if (mcpServerName) mcpServerName.value = server.name || '';
        const transport = inferMcpTransport(server.transport || 'sse', server.url || '');
        server.transport = transport;
        if (mcpTransport) mcpTransport.value = transport;
        if (mcpServerUrl) mcpServerUrl.value = server.url || '';
        if (mcpServerUrl)
            mcpServerUrl.placeholder = this._getDefaultUrlForTransport(server.transport || 'sse');
        if (mcpHeaders) mcpHeaders.value = formatMcpHeaders(server.headers);
        if (mcpServerEnabled) mcpServerEnabled.checked = server.enabled !== false;
        if (mcpToolMode) mcpToolMode.value = server.toolMode === 'selected' ? 'selected' : 'all';

        this._renderToolsUI();
    }

    _renderMcpServerOptions() {
        const { mcpServerSelect } = this.elements;
        if (!mcpServerSelect) return;

        const active = this._getActiveServer();
        if (active) this.mcpActiveServerId = active.id;

        mcpServerSelect.innerHTML = '';
        for (const server of this.mcpServers) {
            const opt = document.createElement('option');
            opt.value = server.id;

            const name = (server.name || '').trim();
            const label = name || server.url || t('defaultMcpServer');
            // Show enabled status with checkmark or cross
            const status = server.enabled === false ? '✗' : '✓';
            opt.textContent = `${status} ${label}`;
            mcpServerSelect.appendChild(opt);
        }

        if (active) mcpServerSelect.value = active.id;
    }

    setMcpTestStatus(text, isError = false) {
        const { mcpTestStatus } = this.elements;
        if (!mcpTestStatus) return;
        mcpTestStatus.textContent = text || '';
        mcpTestStatus.style.color = isError ? '#b00020' : '';
    }

    _serverKey(server) {
        const transport = (server.transport || 'sse').toLowerCase();
        const url = (server.url || '').trim();
        const headers = normalizeMcpHeaders(server.headers);
        const headersKey = Object.keys(headers)
            .sort((a, b) => a.localeCompare(b))
            .map((key) => `${key}:${headers[key]}`)
            .join('\n');
        return `${transport}:${url}:${headersKey}`;
    }

    _getCachedTools(server) {
        const entry = this.mcpToolsCache.get(server.id);
        if (!entry) return null;
        if (entry.key !== this._serverKey(server)) return null;
        return Array.isArray(entry.tools) ? entry.tools : null;
    }

    setMcpToolsList(serverId, transport, url, tools, requestKey = null) {
        const id = serverId || (this._getActiveServer() ? this._getActiveServer().id : null);
        if (!id) return;

        this.mcpToolsCache.set(id, {
            key: requestKey || `${(transport || 'sse').toLowerCase()}:${(url || '').trim()}:`,
            tools: Array.isArray(tools) ? tools : [],
        });

        this.setMcpTestStatus('');
        this._renderToolsUI();
    }

    _renderToolsUI() {
        const { mcpToolsSummary, mcpToolList, mcpToolSearch } = this.elements;
        const server = this._getActiveServer();
        if (!server || !mcpToolList || !mcpToolsSummary) return;

        const cached = this._getCachedTools(server) || [];
        renderMcpToolsUI({
            server,
            tools: cached,
            search: mcpToolSearch ? mcpToolSearch.value || '' : '',
            summaryElement: mcpToolsSummary,
            listElement: mcpToolList,
            uiState: this._getToolsUiState(server.id),
            onToolsChange: () => this._renderToolsUI(),
        });
    }

    _getToolsUiState(serverId) {
        const key = serverId || 'default';
        const existing = this.mcpToolsUiState.get(key);
        if (existing) return existing;

        const state = { openGroups: new Set() };
        // Default: keep groups expanded for usability.
        state.openGroups.add('(other)');
        this.mcpToolsUiState.set(key, state);
        return state;
    }
}
