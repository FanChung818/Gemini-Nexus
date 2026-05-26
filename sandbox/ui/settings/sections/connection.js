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
import { inferMcpTransport, normalizeMcpHeaders } from '../../../../shared/mcp/transport.js';
import { normalizeOpenAIWebSearchSettings } from '../../../../shared/settings/openai.js';
import { formatMcpHeaders, parseMcpHeadersText } from './mcp_header_fields.js';
import { bindConnectionSectionEvents } from './connection_events.js';
import { renderMcpToolsUI } from './mcp_tools_view.js';
import { t } from '../../../core/i18n.js';
import { createPrefixedId } from '../../../../shared/utils/index.js';
import { DOM_IDS } from '../constants.js';
import { getSettingsElement } from '../dom.js';

export function createMcpServerId() {
    return createPrefixedId('srv');
}

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
        return createMcpServerId();
    }

    _getDefaultServer() {
        return createDefaultMcpServer(this._makeServerId());
    }

    _getDefaultUrlForTransport(transport) {
        return getDefaultMcpUrlForTransport(transport);
    }

    queryElements() {
        this.elements = {
            providerSelect: getSettingsElement(DOM_IDS.PROVIDER_SELECT),
            apiKeyContainer: getSettingsElement(DOM_IDS.API_KEY_CONTAINER),
            webFields: getSettingsElement(DOM_IDS.WEB_FIELDS),
            webTemporaryChat: getSettingsElement(DOM_IDS.WEB_TEMPORARY_CHAT),

            officialFields: getSettingsElement(DOM_IDS.OFFICIAL_FIELDS),
            officialBaseUrl: getSettingsElement(DOM_IDS.OFFICIAL_BASE_URL),
            apiKeyInput: getSettingsElement(DOM_IDS.OFFICIAL_API_KEY),
            officialModel: getSettingsElement(DOM_IDS.OFFICIAL_MODEL),
            thinkingLevelSelect: getSettingsElement(DOM_IDS.OFFICIAL_THINKING_LEVEL),
            officialWebSearchEnabled: getSettingsElement(DOM_IDS.OFFICIAL_WEB_SEARCH),

            openaiFields: getSettingsElement(DOM_IDS.OPENAI_FIELDS),
            openaiBaseUrl: getSettingsElement(DOM_IDS.OPENAI_BASE_URL),
            openaiApiKey: getSettingsElement(DOM_IDS.OPENAI_API_KEY),
            openaiModel: getSettingsElement(DOM_IDS.OPENAI_MODEL),
            openaiThinkingLevelSelect: getSettingsElement(DOM_IDS.OPENAI_THINKING_LEVEL),
            openaiUseResponsesApi: getSettingsElement(DOM_IDS.OPENAI_USE_RESPONSES_API),
            openaiWebSearch: getSettingsElement(DOM_IDS.OPENAI_WEB_SEARCH),

            mcpEnabled: getSettingsElement(DOM_IDS.MCP_ENABLED),
            mcpFields: getSettingsElement(DOM_IDS.MCP_FIELDS),
            mcpServerSelect: getSettingsElement(DOM_IDS.MCP_SERVER_SELECT),
            mcpAddServer: getSettingsElement(DOM_IDS.MCP_ADD_SERVER),
            mcpRemoveServer: getSettingsElement(DOM_IDS.MCP_REMOVE_SERVER),
            mcpServerName: getSettingsElement(DOM_IDS.MCP_SERVER_NAME),
            mcpTransport: getSettingsElement(DOM_IDS.MCP_TRANSPORT),
            mcpServerUrl: getSettingsElement(DOM_IDS.MCP_SERVER_URL),
            mcpHeaders: getSettingsElement(DOM_IDS.MCP_HEADERS),
            mcpServerEnabled: getSettingsElement(DOM_IDS.MCP_SERVER_ENABLED),
            mcpTestConnection: getSettingsElement(DOM_IDS.MCP_TEST_CONNECTION),
            mcpTestStatus: getSettingsElement(DOM_IDS.MCP_TEST_STATUS),
            mcpToolMode: getSettingsElement(DOM_IDS.MCP_TOOL_MODE),
            mcpRefreshTools: getSettingsElement(DOM_IDS.MCP_REFRESH_TOOLS),
            mcpEnableAllTools: getSettingsElement(DOM_IDS.MCP_ENABLE_ALL_TOOLS),
            mcpDisableAllTools: getSettingsElement(DOM_IDS.MCP_DISABLE_ALL_TOOLS),
            mcpToolSearch: getSettingsElement(DOM_IDS.MCP_TOOL_SEARCH),
            mcpToolsSummary: getSettingsElement(DOM_IDS.MCP_TOOLS_SUMMARY),
            mcpToolList: getSettingsElement(DOM_IDS.MCP_TOOL_LIST),
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
            webTemporaryChat,
            officialWebSearchEnabled,
            openaiBaseUrl,
            openaiApiKey,
            openaiModel,
            openaiThinkingLevelSelect,
            openaiUseResponsesApi,
            openaiWebSearch,
            mcpEnabled,
        } = this.elements;

        if (providerSelect) {
            const providerValue = data?.provider || DEFAULT_PROVIDER;
            providerSelect.value = providerValue;
            this.updateVisibility(providerValue);
        }

        if (officialBaseUrl)
            officialBaseUrl.value = data?.officialBaseUrl || DEFAULT_OFFICIAL_BASE_URL;
        if (apiKeyInput) apiKeyInput.value = data?.apiKey || '';
        if (officialModel) officialModel.value = data?.officialModel || DEFAULT_OFFICIAL_MODELS;
        if (thinkingLevelSelect)
            thinkingLevelSelect.value = data?.thinkingLevel || DEFAULT_THINKING_LEVEL;
        if (webTemporaryChat) webTemporaryChat.checked = data?.webTemporaryChat === true;
        if (officialWebSearchEnabled)
            officialWebSearchEnabled.checked = data?.officialWebSearch === true;

        if (openaiBaseUrl) openaiBaseUrl.value = data?.openaiBaseUrl || '';
        if (openaiApiKey) openaiApiKey.value = data?.openaiApiKey || '';
        if (openaiModel) openaiModel.value = data?.openaiModel || '';
        if (openaiThinkingLevelSelect)
            openaiThinkingLevelSelect.value = data?.openaiThinkingLevel || DEFAULT_THINKING_LEVEL;
        const openaiSettings = normalizeOpenAIWebSearchSettings(data || {});
        if (openaiUseResponsesApi) openaiUseResponsesApi.checked = openaiSettings.useResponsesApi;
        if (openaiWebSearch) openaiWebSearch.checked = openaiSettings.webSearch;

        if (mcpEnabled) {
            mcpEnabled.checked = data?.mcpEnabled === true;
            this.updateMcpVisibility(mcpEnabled.checked);
        }

        const servers = data && Array.isArray(data.mcpServers) ? data.mcpServers : null;
        const activeId =
            data && typeof data.mcpActiveServerId === 'string' ? data.mcpActiveServerId : null;

        if (servers && servers.length > 0) {
            this.mcpServers = servers.map((serverConfig) => ({
                id: serverConfig.id || this._makeServerId(),
                name: serverConfig.name || '',
                transport: serverConfig.transport || DEFAULT_MCP_TRANSPORT,
                url: serverConfig.url || '',
                headers: normalizeMcpHeaders(serverConfig.headers),
                enabled: serverConfig.enabled !== false,
                toolMode: serverConfig.toolMode === 'selected' ? 'selected' : 'all',
                enabledTools: Array.isArray(serverConfig.enabledTools)
                    ? serverConfig.enabledTools
                    : [],
            }));
            this.mcpActiveServerId =
                activeId && this.mcpServers.some((serverConfig) => serverConfig.id === activeId)
                    ? activeId
                    : this.mcpServers[0].id;
        } else {
            const legacyUrl = data?.mcpServerUrl || '';
            const legacyTransport = data?.mcpTransport || DEFAULT_MCP_TRANSPORT;
            const server = this._getDefaultServer();
            server.transport = legacyTransport;
            server.url = legacyUrl || server.url;
            server.headers = normalizeMcpHeaders(data?.mcpHeaders);
            server.enabled = data?.mcpEnabled === true;
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
            webTemporaryChat,
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
        const firstEnabled = servers.find(
            (serverConfig) =>
                serverConfig.enabled !== false && serverConfig.url && serverConfig.url.trim()
        );

        return {
            provider: providerSelect ? providerSelect.value : DEFAULT_PROVIDER,
            officialBaseUrl: officialBaseUrl
                ? officialBaseUrl.value.trim()
                : DEFAULT_OFFICIAL_BASE_URL,
            apiKey: apiKeyInput ? apiKeyInput.value.trim() : '',
            officialModel: officialModel ? officialModel.value.trim() : DEFAULT_OFFICIAL_MODELS,
            thinkingLevel: thinkingLevelSelect ? thinkingLevelSelect.value : DEFAULT_THINKING_LEVEL,
            webTemporaryChat: webTemporaryChat ? webTemporaryChat.checked === true : false,
            officialWebSearch: officialWebSearchEnabled
                ? officialWebSearchEnabled.checked === true
                : false,
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

            mcpEnabled: mcpEnabled ? mcpEnabled.checked === true : false,
            mcpServers: servers,
            mcpActiveServerId: this.mcpActiveServerId || (servers[0] ? servers[0].id : null),

            mcpTransport: firstEnabled
                ? firstEnabled.transport || DEFAULT_MCP_TRANSPORT
                : DEFAULT_MCP_TRANSPORT,
            mcpServerUrl: firstEnabled ? firstEnabled.url || '' : '',
        };
    }

    updateVisibility(provider) {
        const { apiKeyContainer, webFields, officialFields, openaiFields } = this.elements;
        if (!apiKeyContainer) return;

        if (webFields) webFields.hidden = provider !== 'web';
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
        const match = activeId
            ? this.mcpServers.find((serverConfig) => serverConfig.id === activeId)
            : null;
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
            const optionElement = document.createElement('option');
            optionElement.value = server.id;

            const name = (server.name || '').trim();
            const label = name || server.url || t('defaultMcpServer');
            const status = server.enabled === false ? '✗' : '✓';
            optionElement.textContent = `${status} ${label}`;
            mcpServerSelect.appendChild(optionElement);
        }

        if (active) mcpServerSelect.value = active.id;
    }

    setMcpTestStatus(text, isError = false) {
        const { mcpTestStatus } = this.elements;
        if (!mcpTestStatus) return;
        mcpTestStatus.textContent = text || '';
        mcpTestStatus.classList.toggle('is-error', isError);
    }

    _serverKey(server) {
        const transport = (server.transport || 'sse').toLowerCase();
        const url = (server.url || '').trim();
        const headers = normalizeMcpHeaders(server.headers);
        const headersKey = Object.keys(headers)
            .sort((leftHeaderName, rightHeaderName) =>
                leftHeaderName.localeCompare(rightHeaderName)
            )
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
