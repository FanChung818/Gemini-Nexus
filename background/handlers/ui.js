import { handleToggleBrowserControl } from './ui_browser_control.js';
import {
    handleAreaSelected,
    handleInitiateCapture,
    handleProcessCropInSidePanel,
} from './ui_capture.js';
import { handleFetchGeneratedImage, handleFetchImage } from './ui_image_fetching.js';
import { handleMcpListTools, handleMcpTestConnection } from './ui_mcp_tools.js';
import { handleCheckPageContext, handleGetActiveSelection } from './ui_page_context.js';
import { handleOpenSidePanel, handleToggleSidePanelControl } from './ui_sidepanel.js';
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

        if (request.action === 'OPEN_SIDE_PANEL') {
            handleOpenSidePanel(context, request, sender, sendResponse);
            return true;
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
        if (Number.isInteger(request?.sidePanelTabId) && request.sidePanelTabId > 0) {
            return request.sidePanelTabId;
        }
        if (Number.isInteger(sender?.tab?.id) && sender.tab.id > 0) {
            return sender.tab.id;
        }
        return null;
    }
}
