/**
 * Error.js — Màn hình thông báo lỗi
 */

import { stateMachine, STATES } from '../../core/StateMachine.js';

let _container = null;
let _btnHandler = null;

export const errorScreen = {
  /**
   * @param {HTMLElement} container
   * @param {{ message?: string }} data
   */
  mount(container, data = {}) {
    _container = container;
    const message = data.message ?? 'Đã xảy ra lỗi. Vui lòng thử lại.';

    container.innerHTML = `
      <div class="status-screen__wrapper">
        <svg class="error__icon-svg" viewBox="0 0 52 52">
          <circle cx="26" cy="26" r="25" fill="none" stroke="#ef4444" stroke-width="4"/>
          <line x1="26" y1="14" x2="26" y2="30" stroke="#ef4444" stroke-width="4" stroke-linecap="round"/>
          <circle cx="26" cy="38" r="2.5" fill="#ef4444"/>
        </svg>
        <p class="status-screen__message status-screen__message--error">${message}</p>
        <button class="status-screen__btn" id="btn-retry">Thử lại</button>
      </div>
    `;

    const btn = container.querySelector('#btn-retry');
    _btnHandler = () => stateMachine.transition(STATES.IDLE);
    btn.addEventListener('click', _btnHandler);

    console.info('[Error] Mounted. Waiting for user action.');
  },

  unmount() {
    if (_container && _btnHandler) {
      const btn = _container.querySelector('#btn-retry');
      if (btn) btn.removeEventListener('click', _btnHandler);
    }
    
    _container = null;
    _btnHandler = null;
    console.info('[Error] Unmounted.');
  },
};
