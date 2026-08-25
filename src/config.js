/**
 * config.js — Cấu hình toàn ứng dụng
 *
 * Thay đổi WS_HOST và WS_PORT theo môi trường thực tế.
 * - Trong dev: dùng giá trị tại đây
 * - Trong production: có thể override bằng biến môi trường Vite (VITE_WS_HOST, VITE_WS_PORT)
 *   bằng cách tạo file .env.local (xem .env.example)
 */

/** Host của laptop server (localhost khi test trên cùng máy, IP tĩnh khi chạy trên Pi) */
export const WS_HOST = import.meta.env.VITE_WS_HOST ?? 'localhost';

/** Port WebSocket server đang lắng nghe */
export const WS_PORT = import.meta.env.VITE_WS_PORT ?? '8765';

/** URL đầy đủ được ghép từ host + port */
export const WS_URL = `ws://${WS_HOST}:${WS_PORT}`;
