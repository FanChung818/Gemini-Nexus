import { TemplateIcons } from './icons.js';

export const SidebarTemplate = `
    <!-- SIDEBAR -->
    <div id="history-sidebar" class="sidebar">
        <div class="sidebar-top">
            <div class="search-container">
                ${TemplateIcons.SEARCH}
                <input type="text" id="history-search" data-i18n-placeholder="searchPlaceholder" placeholder="Search for chats" autocomplete="off">
            </div>
        </div>

        <div class="history-list-label" data-i18n="recentLabel">Recent</div>
        <div id="history-list" class="history-list"></div>

        <div class="sidebar-footer">
            <button id="settings-btn" class="settings-btn">
                ${TemplateIcons.SETTINGS}
                <span data-i18n="settings">Settings</span>
            </button>
        </div>
    </div>
    <div id="sidebar-overlay" class="sidebar-overlay"></div>
`;
