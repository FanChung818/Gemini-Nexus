import { createWebModelOptionMarkup } from '../../../shared/models/web_models.js';
import { TemplateIcons } from './icons.js';

export const HeaderTemplate = `
    <!-- HEADER -->
    <div class="header">
        <div class="header-left">
            <button id="history-toggle" class="icon-btn" data-i18n-title="toggleHistory" title="Chat History">
                ${TemplateIcons.HISTORY}
            </button>

            <div class="model-select-wrapper">
                <select id="model-select" data-i18n-title="modelSelectTooltip" title="Select Model (Tab to cycle)">
                    ${createWebModelOptionMarkup()}
                </select>
            </div>
        </div>

        <div class="header-right">
            <button id="tab-switcher-btn" class="icon-btn" hidden data-i18n-title="selectTabTooltip" title="Select a tab to control">
                ${TemplateIcons.TAB_STACK}
            </button>
            <button id="new-chat-header-btn" class="icon-btn" data-i18n-title="newChatTooltip" title="New Chat">
                ${TemplateIcons.NEW_CHAT}
            </button>
        </div>
    </div>

    <!-- Corner Button -->
    <button id="open-full-page-btn" class="corner-btn" data-i18n-title="openFullPageTooltip" title="Open in Full Page">
        ${TemplateIcons.EXTERNAL_OPEN}
    </button>
`;
