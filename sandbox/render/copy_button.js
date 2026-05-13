import { copyToClipboard } from './clipboard.js';

const copyIcon =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const checkIcon =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

export function createCopyButton(getCopyText) {
    const button = document.createElement('button');
    button.className = 'copy-btn';
    button.title = 'Copy content';
    button.innerHTML = copyIcon;

    button.addEventListener('click', async () => {
        try {
            await copyToClipboard(getCopyText());
            button.innerHTML = checkIcon;
            setTimeout(() => {
                button.innerHTML = copyIcon;
            }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    });

    return button;
}
