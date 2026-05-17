export function appendContextCompressionNotice(container, text, options = {}) {
    const div = document.createElement('div');
    div.className = 'context-compression-notice';
    div.setAttribute('role', 'status');

    const lineStart = document.createElement('span');
    lineStart.className = 'context-compression-line';

    const label = document.createElement('span');
    label.className = 'context-compression-label';

    const icon = document.createElement('span');
    icon.className = 'context-compression-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M10 12h4"></path><path d="M10 16h4"></path></svg>';

    const textSpan = document.createElement('span');
    textSpan.className = 'context-compression-text';
    textSpan.textContent = text;

    const lineEnd = document.createElement('span');
    lineEnd.className = 'context-compression-line';

    label.appendChild(icon);
    label.appendChild(textSpan);
    div.appendChild(lineStart);
    div.appendChild(label);
    div.appendChild(lineEnd);
    if (options.complete) {
        div.classList.add('context-compression-complete');
    }
    container.appendChild(div);

    if (options.scroll !== false) {
        setTimeout(() => {
            container.scrollTo({
                top: div.offsetTop - 20,
                behavior: 'smooth',
            });
        }, 10);
    }

    return {
        div,
        update: (nextText) => {
            textSpan.textContent = nextText;
            div.classList.add('context-compression-complete');
        },
        dispose: () => {
            div.remove();
        },
    };
}
