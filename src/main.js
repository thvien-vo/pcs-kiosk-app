/**
 * main.js — Entry point của Kiosk App
 *
 * Thứ tự khởi tạo:
 *  1. Background.js   — Init lớp nền (inject <video> vào #bg-layer)
 *  2. StateMachine    — Đăng ký listener để cầu nối FSM → screenManager + background
 *  3. goToScreen()    — Chuyển đến màn hình IDLE khởi điểm
 *  4. WebSocketMgr    — Kết nối tới server laptop (sau cùng, không block giao diện)
 */

import './style.css';

import { stateMachine, STATES } from './core/StateMachine.js';
import { wsClient }              from './core/wsClient.js';
import { background }            from './background/Background.js';
import { goToScreen }            from './ui/screenManager.js';

// ── 1. Khởi tạo lớp nền ───────────────────────────────────────────────────
// Truyền đường dẫn video hoặc để mặc định '/assets/bg.mp4'
background.init();

// ── 2. Gắn listener vào StateMachine ─────────────────────────────────────
stateMachine.on(({ to, data }) => {
  // Điều phối background dựa trên state
  if (to === STATES.IDLE) {
    background.play();
  } else {
    background.pause();
  }

  // Ánh xạ STATES → tên màn hình screenManager
  const screenMap = {
    [STATES.IDLE]:        'idle',
    [STATES.QR_DISPLAY]:  'qr_display',
    [STATES.SUCCESS]:     'success',
    [STATES.ERROR]:       'error',
    [STATES.MAINTENANCE]: 'maintenance',
  };

  const screenName = screenMap[to];
  if (screenName) {
    goToScreen(screenName, data);
  }
});

// ── 3. Màn hình khởi điểm ────────────────────────────────────────────────
// Gọi trực tiếp goToScreen thay vì stateMachine.transition để khởi tạo
// màn hình đầu tiên mà không cần validate transition từ trạng thái rỗng
goToScreen('idle');
background.play();

// ── 4. Kết nối WebSocket (URL lấy từ src/config.js) ──────────────────────
// Để thay đổi IP/port: sửa src/config.js hoặc đặt VITE_WS_HOST/VITE_WS_PORT
// trong .env.local rồi restart dev server.
wsClient.connect();

console.info('[App] Kiosk App khởi động thành công.');
