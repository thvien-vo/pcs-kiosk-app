import { defineConfig } from 'vite';

export default defineConfig({
  // Không cần thêm plugin gì vì dùng Vanilla JS
  server: {
    host: '0.0.0.0', // Cho phép truy cập từ mạng LAN (để test từ laptop)
    port: 5173,
  },
  build: {
    target: 'es2020', // Chromium trên Raspberry Pi hỗ trợ ES2020
    outDir: 'dist',
  },
});
