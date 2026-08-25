/**
 * wsClient.js — WebSocket client chuyên dụng cho Kiosk App
 *
 * GIAO THỨC INBOUND (JSON nhận từ server):
 *
 *   { "type": "ai_result",        "qrData": "...", "expiresIn": 60 }
 *     → QR_DISPLAY  (bất kỳ state nào)
 *
 *   { "event": "scan_confirmed",  "payload": { ... } }
 *     → SUCCESS  (chỉ từ QR_DISPLAY)
 *
 *   { "event": "user_identified", "payload": { "userName": "...", "userId": "..." } }
 *     → USER_IDENTIFIED  (chỉ từ QR_DISPLAY)
 *
 *   { "event": "points_awarded",  "payload": { "points": 10, "bottleType": "PET" } }
 *     → SUCCESS  (chỉ từ USER_IDENTIFIED)
 *
 *   { "type": "system_status", "status": "idle"|"success"|"error"|"maintenance" }
 *     → màn hình tương ứng (error/maintenance dùng forceTransition)
 *
 * GIAO THỨC OUTBOUND (JSON gửi lên server):
 *
 *   { "event": "register",      "payload": { "stationId": "01" } }
 *     → Gửi tự động mỗi khi connect/reconnect thành công
 *
 *   { "event": "session_ended", "payload": { "reason": "...", "userId": "..." } }
 *     → Gửi khi user bấm "Complete" từ màn UserIdentified
 *
 * CHIẾN LƯỢC RECONNECT:
 *   - Backoff: 1s → 2s → 4s → 8s → 10s (capped).
 *   - Sau FAILURE_THRESHOLD lần thất bại: hiển thị màn hình error.
 *   - Tiếp tục thử lại ngầm vô hạn để tự phục hồi.
 *   - Khi reconnect thành công sau khi đã hiển thị error: tự về IDLE.
 *
 * CÁCH DÙNG:
 *   import { wsClient } from './wsClient.js';
 *   wsClient.connect();
 *   wsClient.sendMessage('session_ended', { reason: 'completed', userId });
 */

import { WS_URL, STATION_ID } from '../config.js';
import { stateMachine, STATES } from './StateMachine.js';

// ─── Hằng số ─────────────────────────────────────────────────────────────────

/** Số lần thất bại liên tiếp trước khi hiển thị UI error */
const FAILURE_THRESHOLD = 3;

/**
 * Chuỗi backoff delay (ms). Phần tử cuối được dùng lặp lại.
 * Index 0 → sau lần disconnect đầu tiên, index 1 → lần 2, v.v.
 */
const BACKOFF_STEPS_MS = [1_000, 2_000, 4_000, 8_000, 10_000];

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Trả về timestamp dạng [HH:MM:SS] để dán vào mỗi dòng log.
 * Dễ đọc khi debug qua chrome://inspect trên Raspberry Pi.
 */
function ts() {
  return new Date().toLocaleTimeString('vi-VN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ─── Class ────────────────────────────────────────────────────────────────────

class WsClient {
  /** @type {WebSocket|null} */
  #ws = null;

  /** Số lần thất bại kết nối liên tiếp (reset về 0 khi connect thành công) */
  #failureCount = 0;

  /** ID của setTimeout đang chờ để reconnect */
  #retryTimer = null;

  /** Đã hiển thị error UI do mất kết nối hay chưa */
  #errorShown = false;

  /** Đặt thành true khi disconnect() thủ công — ngăn auto-reconnect */
  #manualClose = false;

  /** URL WS đang dùng, lưu để dùng lại khi reconnect */
  #url = '';

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Khởi tạo kết nối. Gọi một lần trong main.js.
   * @param {string} [url] - Mặc định lấy từ config.js
   */
  connect(url = WS_URL) {
    this.#url = url;
    this.#manualClose = false;
    console.info(`[WS ${ts()}] Khởi tạo kết nối → ${this.#url}`);
    this.#open();
  }

  /** Đóng kết nối vĩnh viễn, không reconnect. */
  disconnect() {
    this.#manualClose = true;
    clearTimeout(this.#retryTimer);
    this.#ws?.close(1000, 'manual disconnect');
    this.#ws = null;
    console.info(`[WS ${ts()}] Đã ngắt kết nối thủ công.`);
  }

  /**
   * Gửi một event JSON tới server.
   * Không làm gì nếu socket chưa kết nối (log warn thay vì throw).
   *
   * @param {string} eventType   - Tên event, ví dụ 'session_ended'
   * @param {object} [payload={}] - Dữ liệu đính kèm
   * @returns {boolean} true nếu gửi thành công
   */
  sendMessage(eventType, payload = {}) {
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) {
      console.warn(`[WS ${ts()}] sendMessage('${eventType}') bị bỏ qua — WebSocket chưa kết nối (state: ${this.#ws?.readyState ?? 'null'}).`);
      return false;
    }
    const msg = JSON.stringify({ event: eventType, payload });
    this.#ws.send(msg);
    console.info(`[WS ${ts()}] → Gửi: event="${eventType}"`, payload);
    return true;
  }

  // ── Private: lifecycle ─────────────────────────────────────────────────────

  #open() {
    console.info(`[WS ${ts()}] Đang kết nối... (thất bại liên tiếp: ${this.#failureCount})`);

    try {
      this.#ws = new WebSocket(this.#url);
    } catch (err) {
      // URL không hợp lệ — không retry vô nghĩa
      console.error(`[WS ${ts()}] URL không hợp lệ: ${this.#url}`, err);
      return;
    }

    this.#ws.addEventListener('open',    () => this.#onOpen());
    this.#ws.addEventListener('message', (e) => this.#onMessage(e));
    this.#ws.addEventListener('close',   (e) => this.#onClose(e));
    this.#ws.addEventListener('error',   (e) => this.#onError(e));
  }

  #onOpen() {
    const wasErrorShown = this.#errorShown;

    // Reset bộ đếm
    this.#failureCount = 0;
    this.#errorShown   = false;

    console.info(`[WS ${ts()}] ✓ Kết nối thành công tới ${this.#url}`);

    // Đăng ký station với backend ngay sau khi kết nối (và mỗi lần reconnect)
    this.sendMessage('register', { stationId: STATION_ID });

    // Nếu trước đó đang ở màn hình error vì mất mạng → tự phục hồi về IDLE
    if (wasErrorShown) {
      console.info(`[WS ${ts()}] Phục hồi kết nối → về màn hình IDLE`);
      stateMachine.transition(STATES.IDLE);
    }
  }

  #onClose(event) {
    if (this.#manualClose) return;

    this.#failureCount++;
    console.warn(
      `[WS ${ts()}] ✗ Mất kết nối` +
      ` (code: ${event.code}, reason: "${event.reason || 'không rõ'}")` +
      ` — Thất bại lần thứ ${this.#failureCount}`,
    );

    // Hiển thị error UI sau khi vượt ngưỡng FAILURE_THRESHOLD
    if (this.#failureCount >= FAILURE_THRESHOLD && !this.#errorShown) {
      this.#errorShown = true;
      console.warn(`[WS ${ts()}] Đã thất bại ${this.#failureCount} lần → Hiển thị màn hình lỗi kết nối`);
      stateMachine.forceTransition(STATES.ERROR, {
        message: 'System connection lost. Reconnecting…',
      });
    }

    this.#scheduleRetry();
  }

  #onError(event) {
    // Lỗi WS luôn đi kèm onClose → chỉ log để debug, không xử lý thêm
    console.error(`[WS ${ts()}] Lỗi socket:`, event.type ?? event);
  }

  #scheduleRetry() {
    // Lấy delay theo index (capped tại phần tử cuối)
    const stepIndex = Math.min(this.#failureCount - 1, BACKOFF_STEPS_MS.length - 1);
    const delay     = BACKOFF_STEPS_MS[stepIndex];

    console.info(
      `[WS ${ts()}] Lên lịch kết nối lại sau ${delay / 1000}s` +
      ` (lần thử #${this.#failureCount + 1})…`,
    );

    this.#retryTimer = setTimeout(() => {
      // Đóng WS cũ nếu còn treo (trạng thái CONNECTING chưa timeout hẳn)
      if (this.#ws && this.#ws.readyState !== WebSocket.CLOSED) {
        this.#ws.close();
      }
      this.#open();
    }, delay);
  }

  // ── Private: message dispatch ──────────────────────────────────────────────

  #onMessage(event) {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      console.warn(`[WS ${ts()}] Tin nhắn không phải JSON:`, event.data);
      return;
    }

    console.info(`[WS ${ts()}] ← Nhận: event="${msg.event ?? msg.type}"`, msg);

    // Hỗ trợ cả trường "type" (lệnh hệ thống) và "event" (sự kiện nghiệp vụ)
    const key = msg.event ?? msg.type;

    switch (key) {
      case 'ai_result':
        this.#handleAiResult(msg);
        break;
      case 'system_status':
        this.#handleSystemStatus(msg);
        break;
      case 'scan_confirmed':
        this.#handleScanConfirmed(msg);
        break;
      case 'user_identified':
        this.#handleUserIdentified(msg);
        break;
      case 'points_awarded':
        this.#handlePointsAwarded(msg);
        break;
      default:
        console.warn(`[WS ${ts()}] Tin nhắn không được nhận dạng: event/type="${key}"`);
    }
  }

  /**
   * Xử lý kết quả từ AI nhận dạng rác → hiển thị QR.
   *
   * Payload mong đợi:
   *  { type: "ai_result", qrData: string, expiresIn?: number }
   */
  #handleAiResult(msg) {
    const payload = { qrData: msg.qrData, expiresIn: msg.expiresIn };

    if (!payload.qrData) {
      console.warn(`[WS ${ts()}] ai_result thiếu qrData, bỏ qua.`);
      return;
    }

    console.info(`[WS ${ts()}] ai_result → QR_DISPLAY (expires: ${payload.expiresIn ?? 60}s)`);
    stateMachine.transition(STATES.QR_DISPLAY, payload);
  }

  /**
   * Xử lý trạng thái hệ thống → chuyển màn hình tương ứng.
   *
   * Payload mong đợi:
   *  { type: "system_status", status: "idle"|"success"|"error"|"maintenance", message?: string }
   */
  #handleSystemStatus(msg) {
    const { status, message } = msg;

    /** Bảng ánh xạ status string → STATES + loại transition */
    const STATUS_MAP = {
      idle:        { state: STATES.IDLE,        priority: false },
      success:     { state: STATES.SUCCESS,     priority: false },
      error:       { state: STATES.ERROR,       priority: true  },
      maintenance: { state: STATES.MAINTENANCE, priority: true  },
    };

    const mapping = STATUS_MAP[status];

    if (!mapping) {
      console.warn(`[WS ${ts()}] system_status.status không được nhận dạng: "${status}"`);
      return;
    }

    console.info(`[WS ${ts()}] system_status="${status}" → FSM ${mapping.priority ? 'forceTransition' : 'transition'}`);

    const payload = message ? { message } : {};

    if (mapping.priority) {
      stateMachine.forceTransition(mapping.state, payload);
    } else {
      stateMachine.transition(mapping.state, payload);
    }
  }
  /**
   * Xử lý xác nhận người dùng đã quét QR thành công.
   *
   * Payload mong đợi:
   *  { "event": "scan_confirmed", "payload": { "message": "string" } }
   *
   * QUY TẮC LUỒNG TUẦN TỰ:
   *  Event này CHỈ hợp lệ khi app đang ở QR_DISPLAY.
   *  Nếu nhận được lúc đang ở màn hình khác (ví dụ: IDLE, MAINTENANCE),
   *  bỏ qua hoàn toàn để tránh nhảy cóc trạng thái sai.
   *  Không dùng forceTransition — đây là chuyển đổi tuần tự bình thường.
   */
  #handleScanConfirmed(msg) {
    const currentState = stateMachine.state;

    // Guard: chỉ xử lý khi đang ở QR_DISPLAY
    if (currentState !== STATES.QR_DISPLAY) {
      console.warn(
        `[WS ${ts()}] scan_confirmed bị bỏ qua — ` +
        `state hiện tại là "${currentState}", chỉ hợp lệ ở "QR_DISPLAY".`,
      );
      return;
    }

    const payload = msg.payload ?? {};
    console.info(`[WS ${ts()}] scan_confirmed → SUCCESS`, payload);
    stateMachine.transition(STATES.SUCCESS, payload);
  }

  /**
   * user_identified: người dùng đã xác nhận danh tính qua QR.
   * Guard: chỉ hợp lệ khi đang ở QR_DISPLAY.
   *
   * Payload mong đợi:
   *  { "event": "user_identified", "payload": { "userName": string, "userId": string } }
   */
  #handleUserIdentified(msg) {
    const currentState = stateMachine.state;

    if (currentState !== STATES.QR_DISPLAY) {
      console.warn(
        `[WS ${ts()}] user_identified bị bỏ qua — ` +
        `state hiện tại là "${currentState}", chỉ hợp lệ ở "QR_DISPLAY".`,
      );
      return;
    }

    const payload = msg.payload ?? {};
    console.info(`[WS ${ts()}] user_identified → USER_IDENTIFIED`, payload);
    stateMachine.transition(STATES.USER_IDENTIFIED, payload);
  }

  /**
   * points_awarded: điểm đã được cộng cho người dùng.
   * Guard: chỉ hợp lệ khi đang ở USER_IDENTIFIED.
   *
   * Payload mong đợi:
   *  { "event": "points_awarded", "payload": { "points": number, "bottleType": string } }
   */
  #handlePointsAwarded(msg) {
    const currentState = stateMachine.state;

    if (currentState !== STATES.USER_IDENTIFIED) {
      console.warn(
        `[WS ${ts()}] points_awarded bị bỏ qua — ` +
        `state hiện tại là "${currentState}", chỉ hợp lệ ở "USER_IDENTIFIED".`,
      );
      return;
    }

    const payload = msg.payload ?? {};
    console.info(`[WS ${ts()}] points_awarded → SUCCESS`, payload);
    stateMachine.transition(STATES.SUCCESS, payload);
  }
}

// Singleton — toàn app dùng chung 1 instance
export const wsClient = new WsClient();
