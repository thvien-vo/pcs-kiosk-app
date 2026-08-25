/**
 * UserIdentified.js — Screen shown after a user is identified via QR scan.
 *
 * Data received from stateMachine transition:
 *  { userName: string, userId: string }
 *
 * Lifecycle:
 *  - Shows greeting and instruction text
 *  - Runs a 90-second timeout; on expiry → ERROR
 *  - "Complete" button → IDLE immediately + notifies server via WS
 *
 * Security note:
 *  userName/userId come from the network. All user-supplied text MUST be
 *  written via textContent, NEVER via innerHTML, to prevent XSS.
 */

import { stateMachine, STATES } from '../../core/StateMachine.js';
import { wsClient }              from '../../core/wsClient.js';

const TIMEOUT_MS = 90_000; // 90 seconds

// ── Module-scoped resources (cleared in unmount) ──────────────────────────
let _container    = null;
let _timeoutTimer = null;
let _tickInterval = null;
let _btnHandler   = null;
let _userId       = null; // kept for WS sendMessage on Complete

export const userIdentifiedScreen = {
  /**
   * @param {HTMLElement} container
   * @param {{ userName?: string, userId?: string }} data
   */
  mount(container, data = {}) {
    // Guard: clear any stale timers if mount() is called before unmount()
    _clearTimers();

    _container = container;
    _userId    = data.userId ?? null;

    const userName = data.userName ?? 'Guest';

    // ── Build DOM structure (no innerHTML for user data) ──────────────────
    container.innerHTML = `
      <div class="user-identified__wrapper">

        <div class="user-identified__greeting-group">
          <p class="user-identified__greeting" id="ui-greeting"></p>
          <p class="user-identified__instruction">
            Please insert your plastic bottle into the machine
          </p>
        </div>

        <div class="user-identified__waiting" aria-live="polite">
          <div class="user-identified__pulse"></div>
          <p class="user-identified__waiting-label">Waiting for bottle…</p>
        </div>

        <div class="user-identified__footer">
          <p class="user-identified__timeout-hint" id="ui-timeout-hint">
            Auto-cancel in <span id="ui-countdown">90</span>s
          </p>
          <button class="user-identified__btn-complete" id="btn-complete">
            Complete
          </button>
        </div>

      </div>
    `;

    // ── Safely write user-supplied text via textContent ───────────────────
    const greetingEl = container.querySelector('#ui-greeting');
    greetingEl.textContent = `Hello, ${userName}!`;

    // ── Countdown ticker (purely cosmetic, actual timeout below) ──────────
    const countdownEl = container.querySelector('#ui-countdown');
    let secondsLeft   = TIMEOUT_MS / 1000;

    _tickInterval = setInterval(() => {
      secondsLeft -= 1;
      if (countdownEl) countdownEl.textContent = String(Math.max(secondsLeft, 0));
    }, 1000);

    // ── 90-second hard timeout → ERROR ────────────────────────────────────
    _timeoutTimer = setTimeout(() => {
      console.warn('[UserIdentified] Timeout — no points_awarded received.');
      stateMachine.transition(STATES.ERROR, {
        message: 'Timed out waiting for bottle',
      });
    }, TIMEOUT_MS);

    // ── "Complete" button handler ─────────────────────────────────────────
    const btn = container.querySelector('#btn-complete');
    _btnHandler = () => {
      // Notify server if WS is open before leaving the screen
      wsClient.sendMessage('session_ended', {
        reason: 'user_completed_early',
        userId: _userId,
      });
      stateMachine.transition(STATES.IDLE);
    };
    btn.addEventListener('click', _btnHandler);

    console.info(`[UserIdentified] Mounted. User: "${userName}" (${_userId}). Timeout: ${TIMEOUT_MS / 1000}s.`);
  },

  unmount() {
    // Remove button listener before clearing the reference
    if (_container && _btnHandler) {
      const btn = _container.querySelector('#btn-complete');
      if (btn) btn.removeEventListener('click', _btnHandler);
    }

    _clearTimers();

    _container  = null;
    _btnHandler = null;
    _userId     = null;

    console.info('[UserIdentified] Unmounted. All timers cleared.');
  },
};

/** Clears both the hard timeout and the cosmetic tick interval. */
function _clearTimers() {
  if (_timeoutTimer !== null) {
    clearTimeout(_timeoutTimer);
    _timeoutTimer = null;
  }
  if (_tickInterval !== null) {
    clearInterval(_tickInterval);
    _tickInterval = null;
  }
}
