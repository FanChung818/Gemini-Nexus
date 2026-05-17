(function () {
    function cropImage(base64, area) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Canvas 2D context is unavailable.'));
                    return;
                }

                const scale = area.pixelRatio || 1;
                canvas.width = area.width * scale;
                canvas.height = area.height * scale;

                ctx.drawImage(
                    img,
                    area.x * scale,
                    area.y * scale,
                    area.width * scale,
                    area.height * scale,
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );

                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => reject(new Error('Failed to load image for cropping.'));
            img.src = base64;
        });
    }

    globalThis.GeminiNexusCrop = {
        ...(globalThis.GeminiNexusCrop || {}),
        cropImage,
    };
})();
