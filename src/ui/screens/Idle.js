/**
 * Idle.js — Màn hình chờ
 *
 * Cấu trúc DOM (inject vào .screen--idle do screenManager tạo):
 *
 *   .screen--idle                ← container, bắt click/touch toàn vùng
 *   ├── <video.idle__video>      ← video loop full-screen (object-fit: cover)
 *   └── <div.idle__overlay>      ← lớp đè trên video, chứa dòng chữ nhấp nháy
 *       └── <p.idle__prompt>     ← "Chạm vào màn hình để bắt đầu"
 *
 * XỬ LÝ VIDEO KHI QUAY LẠI:
 *   Mỗi lần mount() được gọi (kể cả khi quay lại từ màn khác), video được
 *   reset currentTime = 0 TRƯỚC KHI play() để tránh giật frame lạ khi resume
 *   từ vị trí cũ.
 *
 * LUỒNG CHUYỂN STATE:
 *   Touch/click → stateMachine.transition(QR_DISPLAY)
 *   FSM sẽ kích hoạt goToScreen('qr_display') qua listener trong main.js.
 *   Không gọi goToScreen trực tiếp để giữ FSM làm nguồn sự thật duy nhất.
 */

import { stateMachine, STATES } from '../../core/StateMachine.js';

// ── Module-scoped resource refs (cần cleanup trong unmount) ────────────────
let _container    = null;
let _videoEl      = null;
let _touchHandler = null;

export const idleScreen = {
  /**
   * @param {HTMLElement} container - .screen--idle div do screenManager tạo
   * @param {object} _data          - Không dùng ở màn hình IDLE
   */
  mount(container, _data = {}) {
    _container = container;

    // ── Dựng DOM ──────────────────────────────────────────────────────────
    container.innerHTML = `
      <video
        class="idle__video"
        src="/videos/idle-loop.mp4"
        autoplay
        loop
        muted
        playsinline
        preload="auto"
      ></video>
      <div class="idle__overlay" aria-hidden="true">
        <p class="idle__prompt">Touch the screen to start</p>
      </div>
    `;

    _videoEl = container.querySelector('.idle__video');

    // ── Reset & play video ────────────────────────────────────────────────
    // Reset về đầu trước khi play để tránh giật frame khi quay lại màn hình
    _videoEl.currentTime = 0;
    _videoEl.play().catch((err) => {
      // Autoplay có thể bị block lần đầu trên một số trình duyệt — log thôi
      console.warn('[Idle] Video autoplay bị block:', err.message);
    });

    // ── Gắn event listener trên TOÀN BỘ container ────────────────────────
    // Bao phủ cả vùng video lẫn overlay — người dùng chạm đâu cũng bắt được
    _touchHandler = _onTouch;
    container.addEventListener('click',      _touchHandler);
    container.addEventListener('touchstart', _touchHandler, { passive: true });

    console.info('[Idle] Mounted. Video reset & playing.');
  },

  unmount() {
    // Dừng video để giải phóng decoder GPU trên Pi 3B
    if (_videoEl) {
      _videoEl.pause();
      _videoEl.removeAttribute('src'); // Buộc browser giải phóng resource hẳn
      _videoEl.load();                 // Kết thúc network request nếu còn đang tải
      _videoEl = null;
    }

    // Gỡ event listeners
    if (_container && _touchHandler) {
      _container.removeEventListener('click',      _touchHandler);
      _container.removeEventListener('touchstart', _touchHandler);
    }

    // Xoá references để GC thu hồi
    _container    = null;
    _touchHandler = null;

    console.info('[Idle] Unmounted. Listeners & video resource cleared.');
  },
};

/** Xử lý khi người dùng chạm/click màn hình */
function _onTouch() {
  stateMachine.transition(STATES.QR_DISPLAY);
}
