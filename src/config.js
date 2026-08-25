/**
 * config.js — Cấu hình toàn ứng dụng
 *
 * Thay đổi WS_HOST, WS_PORT, STATION_ID theo môi trường thực tế.
 * - Trong dev: dùng giá trị tại đây
 * - Trong production: override bằng biến môi trường Vite trong .env.local
 *   (VITE_WS_HOST, VITE_WS_PORT, VITE_STATION_ID) rồi restart dev server.
 */

/** Host của laptop server (localhost khi test trên cùng máy, IP tĩnh khi chạy trên Pi) */
export const WS_HOST = import.meta.env.VITE_WS_HOST ?? 'localhost';

/** Port WebSocket server đang lắng nghe */
export const WS_PORT = import.meta.env.VITE_WS_PORT ?? '8765';

/** URL đầy đủ được ghép từ host + port */
export const WS_URL = `ws://${WS_HOST}:${WS_PORT}`;

/**
 * ID định danh kiosk — gửi lên server khi kết nối để backend phân biệt
 * nhiều trạm trong cùng một hệ thống.
 */
export const STATION_ID = import.meta.env.VITE_STATION_ID ?? '01';
