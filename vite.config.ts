import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    root: '.',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    },
    server: {
        proxy: {
            '/websocket': {
                target: process.env.NODE_ENV === 'development' 
                    ? 'http://localhost:8787'
                    : 'https://wizard-online.januxii00.workers.dev',
                ws: true,
            }
        }
    }
});
