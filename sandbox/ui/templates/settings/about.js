import { TemplateIcons } from '../icons.js';

export const AboutSettingsTemplate = `
<div class="setting-group">
    <h4 data-i18n="systemSection">System</h4>
    <div class="shortcut-row">
        <label data-i18n="debugLogs">Debug Logs</label>
        <button id="download-logs" class="btn-secondary settings-secondary-action" data-i18n="downloadLogs">Download Logs</button>
    </div>
</div>

<div class="setting-group" id="about-settings-group">
    <h4 data-i18n="about">About</h4>
    <p class="setting-info">
        <strong>Gemini Nexus</strong>
        <span id="app-current-version"></span>
        <span id="app-update-status" class="app-update-status"></span>
    </p>

    <div class="about-link-row">
        <a href="https://github.com/yeahhe365/Gemini-Nexus" target="_blank" class="github-link">
            ${TemplateIcons.GITHUB}
            <span data-i18n="sourceCode">Source Code</span>
            <span id="star-count" class="star-badge"></span>
        </a>

        <a href="https://github.com/yeahhe365/Gemini-Nexus/releases" target="_blank" class="github-link">
            ${TemplateIcons.RELEASES}
            <span data-i18n="releases">Releases</span>
        </a>
    </div>
</div>`;
