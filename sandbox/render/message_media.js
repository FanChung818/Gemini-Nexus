import { createGeneratedImage } from './generated_image.js';

export function createUserImagesGrid(attachment) {
    const imageSources = Array.isArray(attachment) ? attachment : [attachment];
    const stringSources = imageSources.filter((src) => typeof src === 'string');
    if (stringSources.length === 0) return null;

    const imagesContainer = document.createElement('div');
    imagesContainer.className = 'user-images-grid';
    imagesContainer.style.display = 'flex';
    imagesContainer.style.flexWrap = 'wrap';
    imagesContainer.style.gap = '8px';
    imagesContainer.style.marginBottom = '8px';

    stringSources.forEach((src) => {
        const img = document.createElement('img');
        img.src = src;
        img.className = 'chat-image';

        if (stringSources.length > 1) {
            img.style.maxWidth = '150px';
            img.style.maxHeight = '200px';
            img.style.width = 'auto';
            img.style.height = 'auto';
            img.style.objectFit = 'contain';
            img.style.background = 'rgba(0,0,0,0.05)';
        }

        img.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('gemini-view-image', { detail: src }));
        });
        imagesContainer.appendChild(img);
    });

    return imagesContainer;
}

export function createGeneratedImagesGrid(attachment) {
    if (
        !Array.isArray(attachment) ||
        attachment.length === 0 ||
        typeof attachment[0] !== 'object'
    ) {
        return null;
    }

    const grid = document.createElement('div');
    grid.className = 'generated-images-grid';
    grid.appendChild(createGeneratedImage(attachment[0]));
    return grid;
}
