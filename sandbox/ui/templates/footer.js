import { TemplateIcons } from './icons.js';

export const FooterTemplate = `
    <!-- FOOTER -->
    <div class="footer">
        <div id="status"></div>

        <div class="tools-container">
            <button id="tools-scroll-left" class="scroll-nav-btn left" aria-label="Scroll Left">
                ${TemplateIcons.CHEVRON_LEFT}
            </button>

            <div class="tools-row" id="tools-row">
                <button id="browser-control-btn" class="tool-btn" data-i18n-title="browserControlTooltip" title="Allow model to control browser">
                    ${TemplateIcons.BROWSER_CONTROL}
                    <span data-i18n="browserControl">Control</span>
                </button>
                <button id="page-context-btn" class="tool-btn context-aware" data-i18n-title="pageContextTooltip" title="Toggle chat with page content">
                    ${TemplateIcons.PAGE_CONTEXT}
                    <span data-i18n="pageContext">Page</span>
                </button>
                <button id="quote-btn" class="tool-btn context-aware" data-i18n-title="quoteTooltip" title="Quote selected text from page">
                    ${TemplateIcons.QUOTE}
                    <span data-i18n="quote">Quote</span>
                </button>
                <button id="ocr-btn" class="tool-btn context-aware" data-i18n-title="ocrTooltip" title="Capture area and extract text">
                    ${TemplateIcons.OCR}
                    <span data-i18n="ocr">OCR</span>
                </button>
                <button id="screenshot-translate-btn" class="tool-btn context-aware" data-i18n-title="screenshotTranslateTooltip" title="Capture area and translate text">
                    ${TemplateIcons.TRANSLATE}
                    <span data-i18n="screenshotTranslate">Translate</span>
                </button>
                <button id="screen-capture-btn" class="tool-btn" data-i18n-title="screenCaptureTooltip" title="Capture another screen or app window">
                    ${TemplateIcons.SCREEN_CAPTURE}
                    <span data-i18n="screenCapture">Screen</span>
                </button>
                <button id="snip-btn" class="tool-btn context-aware" data-i18n-title="snipTooltip" title="Capture area to input">
                    ${TemplateIcons.SNIP}
                    <span data-i18n="snip">Snip</span>
                </button>
            </div>

            <button id="tools-scroll-right" class="scroll-nav-btn right" aria-label="Scroll Right">
                ${TemplateIcons.CHEVRON_RIGHT}
            </button>
        </div>

        <div class="input-wrapper">
            <!-- Dynamic Image Preview Container -->
            <div id="image-preview" class="image-preview"></div>

            <div class="input-row">
                <label id="upload-btn" data-i18n-title="uploadImageTooltip" title="Upload File">
                    ${TemplateIcons.PAPERCLIP}
                    <input type="file" id="image-input" class="file-input-hidden" multiple accept="image/*, .pdf, .txt, .js, .py, .html, .css, .json, .csv, .md">
                </label>
                <textarea id="prompt" data-i18n-placeholder="askPlaceholder" placeholder="Ask Gemini..." rows="1"></textarea>
                <button id="send" data-i18n-title="sendMessageTooltip" title="Send message">
                    ${TemplateIcons.SEND}
                </button>
            </div>
        </div>
    </div>
`;
