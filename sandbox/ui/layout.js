import {
    SidebarTemplate,
    HeaderTemplate,
    ChatTemplate,
    FooterTemplate,
    ViewerTemplate,
    SettingsTemplate,
    TabSelectorTemplate,
} from './templates/index.js';

export function renderLayout() {
    const LayoutTemplate =
        SidebarTemplate +
        HeaderTemplate +
        ChatTemplate +
        FooterTemplate +
        ViewerTemplate +
        SettingsTemplate +
        TabSelectorTemplate;
    const app = document.getElementById('app');
    if (app) app.innerHTML = LayoutTemplate;
}
