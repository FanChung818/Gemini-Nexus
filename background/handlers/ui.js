import { handleToggleBrowserControl } from './ui_browser_control.js';
import {
    handleAreaSelected,
    handleInitiateCapture,
    handleProcessCropInSidePanel,
} from './ui_capture.js';
import {
    handleFetchGeminiWatermarkImage,
    handleFetchGeneratedImage,
    handleFetchImage,
} from './ui_image_fetching.js';
import { handleMcpListTools, handleMcpTestConnection } from './ui_mcp_tools.js';
import { handleCheckPageContext, handleGetActiveSelection } from './ui_page_context.js';
import { handleProviderModelList } from './ui_provider_models.js';
import {
    handleOpenSidePanel,
    handleToggleSidePanel,
    handleToggleSidePanelControl,
} from './ui_sidepanel.js';
import { handleGetOpenTabs, handleSwitchTab } from './ui_tab_actions.js';

export class UIMessageHandler {
    constructor(imageHandler, controlManager, mcpManager, sidePanelScopeManager) {
        this.imageHandler = imageHandler;
        this.controlManager = controlManager;
        this.mcpManager = mcpManager;
        this.sidePanelScopeManager = sidePanelScopeManager;
    }

    handle(request, sender, sendResponse) {
        const context = this._createMessageContext();

        if (request.action === 'FETCH_IMAGE') {
            handleFetchImage(context, request, sender, sendResponse);
            return true;
        }

        if (request.action === 'FETCH_GENERATED_IMAGE') {
            handleFetchGeneratedImage(context, request, sender, sendResponse);
            return true;
        }

        if (request.action === 'FETCH_GEMINI_WATERMARK_IMAGE') {
            handleFetchGeminiWatermarkImage(context, request, sender, sendResponse);
            return true;
        }

        if (request.action === 'OPEN_SIDE_PANEL') {
            handleOpenSidePanel(context, request, sender, sendResponse);
            return true;
        }

        if (request.action === 'TOGGLE_SIDE_PANEL') {
            handleToggleSidePanel(context, request, sender, sendResponse);
            return true;
        }

        if (request.action === 'SIDE_PANEL_CLOSED') {
            this.sidePanelScopeManager?.markClosedForTab?.(request.tabId);
            sendResponse({ status: 'processed' });
            return false;
        }

        if (request.action === 'TOGGLE_SIDE_PANEL_CONTROL') {
            handleToggleSidePanelControl(context, request, sender, sendResponse);
            return true;
        }

        if (request.action === 'INITIATE_CAPTURE') {
            handleInitiateCapture(context, request, sender);
            return false;
        }

        if (request.action === 'AREA_SELECTED') {
            handleAreaSelected(context, request, sender, sendResponse);
            return true;
        }

        if (request.action === 'PROCESS_CROP_IN_SIDEPANEL') {
            handleProcessCropInSidePanel(context, request, sender, sendResponse);
            return true;
        }

        if (request.action === 'GET_ACTIVE_SELECTION') {
            handleGetActiveSelection(context, request, sender, sendResponse);
            return true;
        }

        if (request.action === 'CHECK_PAGE_CONTEXT') {
            handleCheckPageContext(context, request, sender, sendResponse);
            return true;
        }

        if (request.action === 'MCP_TEST_CONNECTION') {
            handleMcpTestConnection(this.mcpManager, request, sendResponse);
            return true;
        }

        if (request.action === 'MCP_LIST_TOOLS') {
            handleMcpListTools(this.mcpManager, request, sendResponse);
            return true;
        }

        if (request.action === 'GET_PROVIDER_MODELS') {
            handleProviderModelList(request, sendResponse);
            return true;
        }

        if (request.action === 'GET_OPEN_TABS') {
            handleGetOpenTabs(context, request, sender, sendResponse);
            return true;
        }

        if (request.action === 'SWITCH_TAB') {
            handleSwitchTab(context, request, sender, sendResponse);
            return true;
        }

        if (request.action === 'TOGGLE_BROWSER_CONTROL') {
            handleToggleBrowserControl(context, request, sender, sendResponse);
            return true;
        }

        return false;
    }

    _sendToRequestSource(sender, payload) {
        if (sender.tab) {
            chrome.tabs.sendMessage(sender.tab.id, payload).catch(() => {});
            return;
        }

        chrome.runtime.sendMessage(payload).catch(() => {});
    }

    _createMessageContext() {
        return {
            imageHandler: this.imageHandler,
            controlManager: this.controlManager,
            sidePanelScopeManager: this.sidePanelScopeManager,
            getTargetSidePanelTabId: (request, sender) =>
                this._getTargetSidePanelTabId(request, sender),
            sendToRequestSource: (sender, payload) => this._sendToRequestSource(sender, payload),
        };
    }

    _getTargetSidePanelTabId(request, sender) {
        const requestTabId = request?.sidePanelTabId;
        if (Number.isInteger(requestTabId) && requestTabId > 0) return requestTabId;

        const senderTabId = sender?.tab?.id;
        return Number.isInteger(senderTabId) && senderTabId > 0 ? senderTabId : null;
    }
}
