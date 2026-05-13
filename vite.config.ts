import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

// Define __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(() => {
    return {
        server: {
            port: 3000,
            host: '0.0.0.0',
        },
        plugins: [],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, '.'),
            },
        },
        build: {
            rollupOptions: {
                input: {
                    sidepanel: path.resolve(__dirname, 'sidepanel/index.html'),
                    sandbox: path.resolve(__dirname, 'sandbox/index.html'),
                },
            },
        },
        test: {
            setupFiles: ['./test/setup.js'],
            exclude: ['**/node_modules/**', '**/dist/**', '**/artifacts/**'],
        },
    };
});
