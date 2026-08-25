/**
 * StateMachine.js
 *
 * Finite State Machine trung tâm cho Kiosk App.
 *
 * LUẬT CHUYỂN STATE:
 *
 * Luồng tuần tự — dùng transition(), bị validate theo bảng ALLOWED_TRANSITIONS:
 *
 *   IDLE ──────────────────────────────→ QR_DISPLAY   (người dùng chạm)
 *   QR_DISPLAY ──────────────────────→ SUCCESS        (scan_confirmed từ WS)
 *   QR_DISPLAY ──────────────────────→ ERROR          (WS báo lỗi luồng)
 *   QR_DISPLAY ──────────────────────→ IDLE           (timeout 60s hết giờ)
 *   SUCCESS    ──────────────────────→ IDLE           (auto-return 4s)
 *   ERROR      ──────────────────────→ IDLE           (nút "Thử lại")
 *   MAINTENANCE ─────────────────────→ IDLE           (lệnh RESET_IDLE từ WS)
 *
 * Luồng ưu tiên — dùng forceTransition(), cắt ngang MỌI state:
 *   * → ERROR         (mất kết nối WS liên tiếp 3 lần)
 *   * → MAINTENANCE   (lệnh hệ thống từ server)
 *
 * CÁCH DÙNG:
 *  import { stateMachine } from './StateMachine.js';
 *  stateMachine.on(({ from, to, data }) => { ... });
 *  stateMachine.transition(STATES.QR_DISPLAY);
 *  stateMachine.forceTransition(STATES.ERROR, { message: 'Lỗi server' });
 */

export const STATES = /** @type {const} */ ({
  IDLE: 'IDLE',
  QR_DISPLAY: 'QR_DISPLAY',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
  MAINTENANCE: 'MAINTENANCE',
});

/**
 * Bảng chuyển state hợp lệ cho luồng TUẦN TỰ (transition()).
 * Lệnh nhảy cóc ngoài danh sách sẽ bị log warn + từ chối.
 *
 * Key: state hiện tại → Value: mảng các state đích được phép.
 *
 *  IDLE        → [QR_DISPLAY]
 *  QR_DISPLAY  → [SUCCESS, ERROR, IDLE]   ← IDLE: timeout 60s hết giờ tự động
 *  SUCCESS     → [IDLE]
 *  ERROR       → [IDLE]
 *  MAINTENANCE → [IDLE]
 */
const ALLOWED_TRANSITIONS = {
  [STATES.IDLE]:        [STATES.QR_DISPLAY],
  [STATES.QR_DISPLAY]:  [STATES.SUCCESS, STATES.ERROR, STATES.IDLE],
  [STATES.SUCCESS]:     [STATES.IDLE],
  [STATES.ERROR]:       [STATES.IDLE],
  [STATES.MAINTENANCE]: [STATES.IDLE],
};

/**
 * Các state đích hợp lệ cho luồng ƯU TIÊN (forceTransition()).
 * Cho phép cắt ngang bất kỳ state nào, không qua bảng ALLOWED_TRANSITIONS.
 * Chỉ dùng cho: mất kết nối WS (ERROR) và lệnh bảo trì hệ thống (MAINTENANCE).
 */
const PRIORITY_STATES = new Set([STATES.ERROR, STATES.MAINTENANCE]);

class StateMachine extends EventTarget {
  #currentState = STATES.IDLE;

  get state() {
    return this.#currentState;
  }

  /**
   * Chuyển state theo luồng tuần tự.
   * Bị từ chối nếu vi phạm bảng ALLOWED_TRANSITIONS.
   *
   * Gọi bởi:
   *  - Màn hình Idle: khi người dùng chạm (→ QR_DISPLAY)
   *  - Màn hình QrDisplay: khi timeout 60s (→ IDLE)
   *  - wsClient: khi nhận scan_confirmed (→ SUCCESS)
   *  - wsClient: khi nhận system_status idle/success (→ IDLE / SUCCESS)
   *  - Màn hình Success/Error: auto-return / nút Thử lại (→ IDLE)
   *
   * @param {string} toState - State đích (dùng hằng số từ STATES)
   * @param {object} [data={}] - Dữ liệu tuỳ chọn truyền kèm
   * @returns {boolean} true nếu chuyển thành công, false nếu bị từ chối
   */
  transition(toState, data = {}) {
    const allowed = ALLOWED_TRANSITIONS[this.#currentState] ?? [];

    if (!allowed.includes(toState)) {
      console.warn(
        `[FSM] Transition bị từ chối: ${this.#currentState} → ${toState}. ` +
          `Chuyển đổi tuần tự hợp lệ: [${allowed.join(', ')}]`,
      );
      return false;
    }

    this.#apply(toState, data);
    return true;
  }

  /**
   * Chuyển state ưu tiên cao — cắt ngang mọi state đang hiển thị.
   * Chỉ dành cho WebSocketMgr khi nhận lệnh ERROR hoặc MAINTENANCE.
   *
   * @param {string} toState - Phải là ERROR hoặc MAINTENANCE
   * @param {object} [data={}]
   * @returns {boolean}
   */
  forceTransition(toState, data = {}) {
    if (!PRIORITY_STATES.has(toState)) {
      console.warn(
        `[FSM] forceTransition chỉ cho phép ERROR/MAINTENANCE. ` +
          `"${toState}" không hợp lệ.`,
      );
      return false;
    }

    console.info(`[FSM] Force transition: ${this.#currentState} → ${toState}`);
    this.#apply(toState, data);
    return true;
  }

  /**
   * Áp dụng chuyển state và phát sự kiện 'stateChange'.
   * @private
   */
  #apply(toState, data) {
    const from = this.#currentState;
    this.#currentState = toState;

    console.info(`[FSM] ${from} → ${toState}`);

    this.dispatchEvent(
      new CustomEvent('stateChange', {
        detail: { from, to: toState, data },
      }),
    );
  }

  /**
   * Shorthand đăng ký lắng nghe sự kiện stateChange.
   * @param {function({ from: string, to: string, data: object }): void} handler
   */
  on(handler) {
    this.addEventListener('stateChange', (e) => handler(e.detail));
  }
}

// Singleton — toàn app dùng chung 1 instance
export const stateMachine = new StateMachine();
