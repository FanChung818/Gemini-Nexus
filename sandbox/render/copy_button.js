import { copyToClipboard } from './clipboard.js';
import { t } from '../core/i18n.js';
import '../../shared/ui/copy_feedback.js';

const copyIcon =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';

export function createCopyButton(getCopyText) {
    const button = document.createElement('button');
    button.className = 'copy-btn';
    button.title = t('copyContent');
    button.innerHTML = copyIcon;

    button.addEventListener('click', async () => {
        try {
            await copyToClipboard(getCopyText());
            globalThis.GeminiCopyFeedback.showCopied(button, t('copied'));
        } catch (error) {
            console.error('Failed to copy text: ', error);
        }
    });

    return button;
}
