/**
 * QrDisplay.js — Màn hình hiển thị mã QR
 *
 * data truyền vào từ stateMachine / WebSocket:
 *  { qrData: string, expiresIn?: number }
 *
 * YÊU CẦU:
 * - Generate QR Code bằng client-side (qrcode).
 * - SVG Circle đếm ngược (mặc định 60s), animate qua stroke-dashoffset.
 * - Hết giờ tự động về IDLE.
 * - Clean up interval triệt để khi unmount.
 */

import QRCode from 'qrcode';
import { STATION_ID } from '../../config.js';
import { stateMachine, STATES } from '../../core/StateMachine.js';

let _container = null;
let _countdownInterval = null;

const DEFAULT_EXPIRES_IN = 60; // Giây
const CIRCLE_RADIUS = 45;
const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

/**
 * Sinh ID ngẫu nhiên cho phiên quét QR (timestamp + chuỗi ngẫu nhiên)
 * @returns {string}
 */
function generateRandomId() {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${randomStr}`;
}

export const qrDisplayScreen = {
  /**
   * @param {HTMLElement} container
   * @param {{ qrData?: string, expiresIn?: number }} data
   */
  mount(container, data = {}) {
    // Guard: clear interval cũ nếu mount() bị gọi lại trước unmount()
    // (xảy ra khi screenManager gọi mount() để update data trên cùng màn hình,
    // hoặc khi rapid transitions xảy ra trước 350ms transition window).
    if (_countdownInterval !== null) {
      clearInterval(_countdownInterval);
      _countdownInterval = null;
    }

    _container = container;

    // Sinh mã QR theo định dạng: pcs-station-{stationId}-session-{randomId}
    const randomId = generateRandomId();
    const defaultQr = `pcs-station-${STATION_ID}-session-${randomId}`;
    const qrData = data.qrData || defaultQr;
    const totalTime = data.expiresIn || DEFAULT_EXPIRES_IN;
    let timeLeft = totalTime;

    container.innerHTML = `
      <div class="qr-display__wrapper">
        <div class="qr-display__timer-wrapper">
          <svg class="qr-display__svg-timer" viewBox="0 0 100 100">
            <circle class="qr-display__circle-bg" cx="50" cy="50" r="${CIRCLE_RADIUS}"></circle>
            <!-- SVG Progress Circle: stroke-dasharray bằng chu vi, bắt đầu offset = 0 (đầy đủ) -->
            <circle class="qr-display__circle-progress" cx="50" cy="50" r="${CIRCLE_RADIUS}"
                    style="stroke-dasharray: ${CIRCUMFERENCE}; stroke-dashoffset: 0;"></circle>
          </svg>
          <div class="qr-display__time-text">${timeLeft}</div>
        </div>
        
        <div class="qr-display__qr-container">
          <canvas class="qr-display__canvas"></canvas>
        </div>
        
        <p class="qr-display__label">Please scan the QR code to continue</p>
      </div>
    `;

    const canvas = container.querySelector('.qr-display__canvas');
    const circleProgress = container.querySelector('.qr-display__circle-progress');
    const timeText = container.querySelector('.qr-display__time-text');

    // 1. Render QR Code
    QRCode.toCanvas(canvas, qrData, {
      width: 280,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    }, (err) => {
      if (err) console.error('[QrDisplay] Lỗi tạo QR code:', err);
    });

    // 2. Khởi tạo Interval đếm ngược
    _countdownInterval = setInterval(() => {
      timeLeft -= 1;

      // Hết giờ -> Chuyển về IDLE
      if (timeLeft <= 0) {
        clearInterval(_countdownInterval);
        _countdownInterval = null;
        stateMachine.transition(STATES.IDLE);
        return;
      }

      // Cập nhật text hiển thị
      timeText.textContent = timeLeft;

      // Cập nhật progress vòng tròn SVG (stroke-dashoffset)
      // Khi timeLeft = totalTime -> offset = 0 (full)
      // Khi timeLeft = 0 -> offset = CIRCUMFERENCE (empty)
      const offset = CIRCUMFERENCE - (timeLeft / totalTime) * CIRCUMFERENCE;
      circleProgress.style.strokeDashoffset = offset;

    }, 1000);

    console.info(`[QrDisplay] Mounted. QR: ${qrData}, Time: ${totalTime}s`);
  },

  unmount() {
    // Dọn dẹp Interval triệt để, tái sử dụng logic an toàn chống memory leak
    if (_countdownInterval) {
      clearInterval(_countdownInterval);
      _countdownInterval = null;
    }
    
    _container = null;
    console.info('[QrDisplay] Unmounted. Timer cleared.');
  },
};
