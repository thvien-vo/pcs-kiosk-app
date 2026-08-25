/**
 * Background.js
 *
 * Quản lý lớp nền động (#bg-layer).
 *
 * API CỐT LÕI:
 *  background.init()   — Inject nội dung vào #bg-layer (video/canvas/css)
 *  background.play()   — Bắt đầu / tiếp tục phát hiệu ứng nền
 *  background.pause()  — Dừng phát để giải phóng CPU (hoặc no-op nếu dùng
 *                        player ngoài hệ điều hành - xem ghi chú bên dưới)
 *
 * CHIẾN LƯỢC "RUỘT" HIỆN TẠI: <video> HTML5
 *  Để đổi sang Canvas hoặc CSS Animation:
 *   1. Chỉ thay phần bên trong class này (init, play, pause)
 *   2. Không cần đụng đến screenManager.js hay bất kỳ screen nào
 *
 * GHI CHÚ VỀ no-op:
 *  Nếu sau này dùng player OS ngoài (omxplayer, mpv) làm nền dưới
 *  trình duyệt trong suốt, hàm pause() có thể để rỗng (no-op).
 *  Lý do: các màn hình không phải IDLE đã có nền đục che khuất hoàn toàn,
 *  không cần phải dừng tiến trình OS ngoài. Background.js KHÔNG giao
 *  tiếp với OS (không gọi shell command) ở giai đoạn này.
 */

class Background {
  /** @type {HTMLElement} */
  #container = null;

  /** @type {HTMLVideoElement|null} */
  #videoEl = null;

  /**
   * Khởi tạo và inject nội dung vào #bg-layer.
   * Gọi một lần duy nhất trong main.js.
   *
   * @param {string} [videoSrc] - Đường dẫn tới file video (tuỳ chọn)
   */
  init(videoSrc = '/assets/bg.mp4') {
    this.#container = document.getElementById('bg-layer');

    if (!this.#container) {
      console.error('[BG] Không tìm thấy #bg-layer trong DOM.');
      return;
    }

    // ── Chiến lược hiện tại: <video> HTML5 ──────────────────────
    const video = document.createElement('video');
    video.src = videoSrc;
    video.loop = true;
    video.muted = true;      // Bắt buộc để autoplay hoạt động trên Chromium
    video.playsInline = true;
    video.preload = 'auto';

    this.#container.appendChild(video);
    this.#videoEl = video;
    // ─────────────────────────────────────────────────────────────

    console.info('[BG] Đã khởi tạo lớp nền.');
  }

  /**
   * Bắt đầu / tiếp tục phát hiệu ứng nền.
   * Được gọi khi app chuyển sang màn hình IDLE.
   */
  play() {
    if (!this.#videoEl) return;
    this.#videoEl.play().catch((err) => {
      // Autoplay có thể bị block, log để biết — không throw lỗi
      console.warn('[BG] Không thể play video:', err.message);
    });
  }

  /**
   * Tạm dừng hiệu ứng nền để giải phóng CPU/GPU cho các màn hình khác.
   * Được gọi khi app rời khỏi màn hình IDLE.
   *
   * NOTE: Nếu dùng player OS ngoài, hàm này là no-op — chỉ cần xoá body
   *       của hàm. Các màn hình không phải IDLE đã có nền đục che khuất.
   */
  pause() {
    if (!this.#videoEl) return;
    this.#videoEl.pause();
  }
}

// Singleton
export const background = new Background();
