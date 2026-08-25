/**
 * Success.js — Màn hình xác nhận thành công
 */

import { stateMachine, STATES } from '../../core/StateMachine.js';

const DEFAULT_AUTO_RETURN_MS = 4_000;

let _autoReturnTimer = null;

export const successScreen = {
  /**
   * @param {HTMLElement} container
   * @param {{ message?: string, autoReturnMs?: number }} data
   */
  mount(container, data = {}) {
    const message = data.message ?? 'Cảm ơn bạn!';
    const delay = data.autoReturnMs ?? DEFAULT_AUTO_RETURN_MS;

    container.innerHTML = `
      <div class="status-screen__wrapper">
        <div class="success__icon-svg-wrapper">
          <svg class="success__icon-svg" viewBox="0 0 52 52">
            <circle class="success__icon-circle" cx="26" cy="26" r="25" fill="none"/>
            <path class="success__icon-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
          </svg>
        </div>
        <p class="status-screen__message status-screen__message--success">${message}</p>
        <p class="status-screen__hint">Tự động về màn hình chờ sau ${delay / 1000}s</p>
      </div>
    `;

    _autoReturnTimer = setTimeout(() => {
      stateMachine.transition(STATES.IDLE);
    }, delay);

    console.info(`[Success] Mounted. Auto-return sau ${delay}ms.`);
  },

  unmount() {
    if (_autoReturnTimer !== null) {
      clearTimeout(_autoReturnTimer);
      _autoReturnTimer = null;
    }
    console.info('[Success] Unmounted.');
  },
};
