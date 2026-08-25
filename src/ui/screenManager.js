/**
 * screenManager.js
 *
 * Quản lý chuyển đổi giữa 5 màn hình với CSS transition opacity/transform
 * (fade-in + scale, 350ms).
 *
 * THIẾT KẾ CHỐNG RÒ RỈ BỘ NHỚ:
 *  Mỗi màn hình (screen module) phải export đối tượng có cấu trúc:
 *   {
 *     mount(container: HTMLElement, data: object): void  — Render + gắn events + khởi tạo timer
 *     unmount(): void                                    — Clear timers/intervals/listeners
 *   }
 *
 *  Khi goToScreen() được gọi:
 *   1. Fade-out màn hình cũ (set class .is-active = false)
 *   2. Gọi unmount() của màn hình CŨ (clear tất cả timer/interval)
 *   3. Fade-in màn hình mới (set class .is-active = true)
 *   4. Gọi mount() của màn hình MỚI
 *
 * CÁCH DÙNG (từ StateMachine listener):
 *  import { goToScreen } from '../ui/screenManager.js';
 *  goToScreen('idle');
 *  goToScreen('qr_display', { qrValue: 'https://...' });
 */

import { idleScreen } from './screens/Idle.js';
import { qrDisplayScreen } from './screens/QrDisplay.js';
import { successScreen } from './screens/Success.js';
import { errorScreen } from './screens/Error.js';
import { maintenanceScreen } from './screens/Maintenance.js';

/**
 * Map tên màn hình → module screen.
 * Mỗi value phải implement interface { mount(el, data), unmount() }.
 * @type {Record<string, { mount(el: HTMLElement, data: object): void, unmount(): void }>}
 */
const SCREEN_MODULES = {
  idle: idleScreen,
  qr_display: qrDisplayScreen,
  success: successScreen,
  error: errorScreen,
  maintenance: maintenanceScreen,
};

/** Thời gian transition (ms) — phải khớp với CSS transition-duration trong style.css */
const TRANSITION_DURATION_MS = 350;

/** Container của tất cả màn hình */
const uiLayer = document.getElementById('ui-layer');

/** Tên màn hình đang hiển thị */
let currentScreenName = null;

/** Div element của màn hình đang hiển thị */
let currentScreenEl = null;

/**
 * ID của setTimeout dọn màn hình cũ.
 * PHẢI được cancel nếu goToScreen() được gọi lại trước khi timer này kịp chạy,
 * tránh unmount() sai màn hình mới đang active.
 */
let _pendingUnmountTimer = null;

/**
 * Chuyển đến màn hình mới với fade transition.
 * Safe to call từ StateMachine listener, event handler, hoặc timeout.
 *
 * @param {string} screenName - 'idle' | 'qr_display' | 'success' | 'error' | 'maintenance'
 * @param {object} [data={}]  - Dữ liệu truyền cho màn hình mới (ví dụ: { qrValue, message })
 */
export function goToScreen(screenName, data = {}) {
  if (!(screenName in SCREEN_MODULES)) {
    console.error(`[ScreenMgr] Màn hình không tồn tại: "${screenName}"`);
    return;
  }

  if (screenName === currentScreenName) {
    // Gọi mount lại để cập nhật dữ liệu mà không cần animation
    SCREEN_MODULES[screenName].mount(currentScreenEl, data);
    return;
  }

  // ── 0. Cancel unmount timer cũ nếu còn đang chờ ──────────────────────────
  // Kịch bản: goToScreen('error') được gọi trong vòng 350ms sau goToScreen('success').
  // Nếu không cancel, timer cũ sẽ gọi unmount('success') trên màn hình đang active,
  // huỷ sạch DOM và event listeners của error screen đang hiển thị.
  if (_pendingUnmountTimer !== null) {
    clearTimeout(_pendingUnmountTimer);
    _pendingUnmountTimer = null;
    // Unmount ngay lập tức (không chờ animation) vì transition đã bị cắt ngang
    if (currentScreenEl && currentScreenName) {
      SCREEN_MODULES[currentScreenName].unmount();
      currentScreenEl.remove();
    }
  }

  const outgoingName = currentScreenName;
  const outgoingEl   = currentScreenEl;

  // ── 1. Fade-out màn hình CŨ ───────────────────────────────────────────────
  if (outgoingEl) {
    outgoingEl.classList.remove('is-active');
  }

  // ── 2. Unmount màn hình CŨ sau khi transition kết thúc ───────────────────
  //    unmount() PHẢI được gọi SAU transition để animation không bị giật.
  //    Timer này được lưu vào _pendingUnmountTimer để có thể cancel nếu cần.
  _pendingUnmountTimer = setTimeout(() => {
    _pendingUnmountTimer = null;
    if (outgoingEl && outgoingName) {
      SCREEN_MODULES[outgoingName].unmount();
      outgoingEl.remove();
      console.info(`[ScreenMgr] Unmounted: ${outgoingName}`);
    }
  }, TRANSITION_DURATION_MS);

  // ── 3. Tạo và mount màn hình MỚI ──────────────────────────────────────────
  const newEl = _createScreenElement(screenName);
  uiLayer.appendChild(newEl);
  SCREEN_MODULES[screenName].mount(newEl, data);

  // Đẩy vào 2 rAF để đảm bảo CSS transition kích hoạt
  // (nếu add class ngay lập tức, browser gộp 2 thay đổi và bỏ qua transition)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      newEl.classList.add('is-active');
    });
  });

  // ── 4. Cập nhật state ──────────────────────────────────────────────────────
  currentScreenName = screenName;
  currentScreenEl   = newEl;

  console.info(`[ScreenMgr] Chuyển màn hình: ${outgoingName ?? '(none)'} → ${screenName}`);
}

/**
 * Tạo div container cho một màn hình.
 * @private
 * @param {string} screenName
 * @returns {HTMLElement}
 */
function _createScreenElement(screenName) {
  const el = document.createElement('div');
  // replaceAll thay vì replace để xử lý đúng tên có nhiều dấu gạch dưới
  el.className = `screen screen--${screenName.replaceAll('_', '-')}`;
  el.dataset.screen = screenName;
  return el;
}
