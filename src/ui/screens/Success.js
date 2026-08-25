/**
 * Success.js — Success confirmation screen
 *
 * Data received:
 *  { points?: number, bottleType?: string, message?: string, autoReturnMs?: number }
 */

import { stateMachine, STATES } from '../../core/StateMachine.js';

const DEFAULT_AUTO_RETURN_MS = 4_000;

let _container = null;
let _autoReturnTimer = null;
let _btnHandler = null;

export const successScreen = {
  /**
   * @param {HTMLElement} container
   * @param {{ points?: number, bottleType?: string, message?: string, autoReturnMs?: number }} data
   */
  mount(container, data = {}) {
    // Clear any previous timer if mount is called rapidly
    if (_autoReturnTimer !== null) {
      clearTimeout(_autoReturnTimer);
      _autoReturnTimer = null;
    }

    _container = container;
    const delay = data.autoReturnMs ?? DEFAULT_AUTO_RETURN_MS;

    const pointsText = data.points !== undefined
      ? `Thank you! You earned ${data.points} points`
      : (data.message ?? 'Thank you!');

    container.innerHTML = `
      <div class="status-screen__wrapper">
        <div class="success__icon-svg-wrapper">
          <svg class="success__icon-svg" viewBox="0 0 52 52">
            <circle class="success__icon-circle" cx="26" cy="26" r="25" fill="none"/>
            <path class="success__icon-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
          </svg>
        </div>
        <p class="status-screen__message status-screen__message--success" id="ui-success-message"></p>
        <div class="status-screen__footer">
          <p class="status-screen__hint">Auto-returning in ${delay / 1000}s</p>
          <button class="status-screen__btn-complete" id="btn-complete">
            Complete
          </button>
        </div>
      </div>
    `;

    // Safely write text content to prevent XSS
    const messageEl = container.querySelector('#ui-success-message');
    if (messageEl) {
      messageEl.textContent = pointsText;
    }

    // Complete button handler
    const btn = container.querySelector('#btn-complete');
    _btnHandler = () => {
      stateMachine.transition(STATES.IDLE);
    };
    if (btn) {
      btn.addEventListener('click', _btnHandler);
    }

    _autoReturnTimer = setTimeout(() => {
      stateMachine.transition(STATES.IDLE);
    }, delay);

    console.info(`[Success] Mounted. Points: ${data.points ?? 'N/A'}. Auto-return in ${delay}ms.`);
  },

  unmount() {
    if (_container && _btnHandler) {
      const btn = _container.querySelector('#btn-complete');
      if (btn) btn.removeEventListener('click', _btnHandler);
    }

    if (_autoReturnTimer !== null) {
      clearTimeout(_autoReturnTimer);
      _autoReturnTimer = null;
    }

    _container = null;
    _btnHandler = null;

    console.info('[Success] Unmounted. Timers and listeners cleared.');
  },
};
