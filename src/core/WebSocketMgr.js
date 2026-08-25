/**
 * WebSocketMgr.js
 *
 * Quản lý kết nối WebSocket tới server laptop (cùng mạng LAN).
 * - Tự động reconnect theo exponential backoff khi mất kết nối.
 * - Parse lệnh JSON từ server và ánh xạ vào StateMachine.
 *
 * GIAO THỨC LỆNH TỪ SERVER (JSON):
 *  { "command": "SHOW_QR",         "data": { "qr": "..." } }
 *  { "command": "SHOW_SUCCESS",    "data": { "message": "..." } }
 *  { "command": "SHOW_ERROR",      "data": { "message": "..." } }   ← ưu tiên cao
 *  { "command": "SHOW_MAINTENANCE","data": {} }                      ← ưu tiên cao
 *  { "command": "RESET_IDLE",      "data": {} }
 *
 * CÁCH DÙNG:
 *  import { wsManager } from './WebSocketMgr.js';
 *  wsManager.connect('ws://192.168.1.100:8765');
 */

import { stateMachine, STATES } from './StateMachine.js';

/** Backoff: bắt đầu 1s, nhân đôi mỗi lần, tối đa 30s */
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

class WebSocketMgr {
  #ws = null;
  #url = '';
  #retryCount = 0;
  #retryTimer = null;
  #manualClose = false; // Phân biệt đóng chủ động vs mất kết nối

  /**
   * Khởi tạo kết nối WebSocket.
   * @param {string} url - ví dụ: 'ws://192.168.1.100:8765'
   */
  connect(url) {
    this.#url = url;
    this.#manualClose = false;
    this.#openConnection();
  }

  /** Đóng kết nối thủ công (không reconnect). */
  disconnect() {
    this.#manualClose = true;
    clearTimeout(this.#retryTimer);
    this.#ws?.close();
    this.#ws = null;
    console.info('[WS] Đã ngắt kết nối thủ công.');
  }

  #openConnection() {
    console.info(`[WS] Đang kết nối tới ${this.#url}...`);
    this.#ws = new WebSocket(this.#url);

    this.#ws.addEventListener('open', this.#onOpen.bind(this));
    this.#ws.addEventListener('message', this.#onMessage.bind(this));
    this.#ws.addEventListener('close', this.#onClose.bind(this));
    this.#ws.addEventListener('error', this.#onError.bind(this));
  }

  #onOpen() {
    this.#retryCount = 0; // Reset backoff khi kết nối thành công
    console.info('[WS] Kết nối thành công.');
  }

  #onMessage(event) {
    let parsed;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      console.warn('[WS] Dữ liệu không hợp lệ (không phải JSON):', event.data);
      return;
    }

    const { command, data = {} } = parsed;
    console.info('[WS] Lệnh nhận được:', command, data);
    this.#dispatch(command, data);
  }

  #onClose(event) {
    if (this.#manualClose) return;
    console.warn(`[WS] Mất kết nối (code: ${event.code}). Sẽ thử lại...`);
    this.#scheduleRetry();
  }

  #onError(event) {
    // Lỗi WS thường đi kèm với onClose, log để debug nhưng không xử lý kép
    console.error('[WS] Lỗi kết nối:', event);
  }

  #scheduleRetry() {
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** this.#retryCount, BACKOFF_MAX_MS);
    this.#retryCount++;
    console.info(`[WS] Thử kết nối lại sau ${delay / 1000}s (lần ${this.#retryCount})...`);
    this.#retryTimer = setTimeout(() => this.#openConnection(), delay);
  }

  /**
   * Ánh xạ lệnh nhận được từ server → StateMachine transition.
   * @param {string} command
   * @param {object} data
   */
  #dispatch(command, data) {
    switch (command) {
      case 'SHOW_QR':
        stateMachine.transition(STATES.QR_DISPLAY, data);
        break;
      case 'SHOW_SUCCESS':
        stateMachine.transition(STATES.SUCCESS, data);
        break;
      // Lệnh ưu tiên cao — dùng forceTransition để cắt ngang mọi state
      case 'SHOW_ERROR':
        stateMachine.forceTransition(STATES.ERROR, data);
        break;
      case 'SHOW_MAINTENANCE':
        stateMachine.forceTransition(STATES.MAINTENANCE, data);
        break;
      case 'RESET_IDLE':
        stateMachine.transition(STATES.IDLE, data);
        break;
      default:
        console.warn('[WS] Lệnh không được nhận dạng:', command);
    }
  }
}

// Singleton
export const wsManager = new WebSocketMgr();
