function triggerDownload(url, filename) {
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = filename;
    document.body.appendChild(downloadLink);

    try {
        downloadLink.click();
    } finally {
        document.body.removeChild(downloadLink);
    }
}

export function downloadFile(url, filename) {
    triggerDownload(url, filename);
}

export function downloadText(text, filename, contentType = 'text/plain') {
    const blob = new Blob([text], { type: contentType || 'text/plain' });
    const url = URL.createObjectURL(blob);

    try {
        triggerDownload(url, filename || 'download.txt');
    } finally {
        URL.revokeObjectURL(url);
    }
}
