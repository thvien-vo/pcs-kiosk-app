/**
 * UserIdentified.js — Screen shown after a user is identified via QR scan.
 *
 * Data received from stateMachine transition:
 *  { userName: string, userId: string }
 *
 * MULTI-BOTTLE ACCUMULATION:
 *  This screen supports receiving MULTIPLE points_awarded events in a single
 *  session. Points are accumulated and bottle types are collected. Each
 *  points_awarded extends the countdown by 5 seconds (capped at 180s total
 *  session time from mount).
 *
 *  When the countdown reaches 0:
 *   - If accumulated points > 0 → SUCCESS with total points & bottle list
 *   - If accumulated points = 0 → ERROR (no bottles received)
 *
 *  "Complete" button (early finish):
 *   - If accumulated points > 0 → SUCCESS with total points (ends session early)
 *   - If accumulated points = 0 → IDLE + session_ended (no bottles, just leave)
 *
 * TIMER ARCHITECTURE:
 *  Only ONE setInterval (_tickInterval) runs at any given time. The
 *  POINTS_AWARDED handler modifies _secondsLeft directly — the single
 *  interval picks up the updated value on its next tick. No new intervals
 *  are created when bottles arrive.
 *
 * Security note:
 *  userName/userId come from the network. All user-supplied text MUST be
 *  written via textContent, NEVER via innerHTML, to prevent XSS.
 */

import { stateMachine, STATES } from '../../core/StateMachine.js';
import { wsClient }              from '../../core/wsClient.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const INITIAL_TIMEOUT_S = 90;       // Initial countdown (seconds)
const MAX_SESSION_S     = 180;      // Hard cap on total session time from mount
const BONUS_SECONDS     = 5;        // Extra seconds per bottle received

// ─── Module-scoped resources (cleared in unmount) ─────────────────────────────
let _container     = null;
let _tickInterval  = null;
let _btnHandler    = null;
let _pointsHandler = null;
let _userId        = null;

// Accumulator state
let _totalPoints = 0;
let _bottleTypes = [];
let _secondsLeft = 0;    // Countdown remaining (modified by interval AND by POINTS_AWARDED handler)
let _elapsedTime = 0;    // Seconds elapsed since mount (for 180s cap check)

// DOM refs for live updates (avoids querySelector every tick)
let _countdownEl    = null;
let _pointsStatusEl = null;
let _waitingLabelEl = null;

export const userIdentifiedScreen = {
  /**
   * @param {HTMLElement} container
   * @param {{ userName?: string, userId?: string }} data
   */
  mount(container, data = {}) {
    // Guard: clear any stale timers/listeners if mount() is called before unmount()
    _clearAll();

    _container   = container;
    _userId      = data.userId ?? null;
    _totalPoints = 0;
    _bottleTypes = [];
    _secondsLeft = INITIAL_TIMEOUT_S;
    _elapsedTime = 0;

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
          <p class="user-identified__waiting-label" id="ui-waiting-label">Waiting for bottle…</p>
          <p class="user-identified__points-status" id="ui-points-status"></p>
        </div>

        <div class="user-identified__footer">
          <p class="user-identified__timeout-hint" id="ui-timeout-hint">
            Auto-cancel in <span id="ui-countdown">${INITIAL_TIMEOUT_S}</span>s
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

    // ── Cache DOM refs ───────────────────────────────────────────────────
    _countdownEl    = container.querySelector('#ui-countdown');
    _pointsStatusEl = container.querySelector('#ui-points-status');
    _waitingLabelEl = container.querySelector('#ui-waiting-label');

    // ── Single countdown interval (1 tick/s) ─────────────────────────────
    // This is the ONLY interval for this screen. _secondsLeft is modified
    // externally by the POINTS_AWARDED handler — this interval just reads it.
    _tickInterval = setInterval(() => {
      _elapsedTime++;
      _secondsLeft--;

      if (_countdownEl) {
        _countdownEl.textContent = String(Math.max(_secondsLeft, 0));
      }

      // ── Time's up ────────────────────────────────────────────────────
      if (_secondsLeft <= 0) {
        clearInterval(_tickInterval);
        _tickInterval = null;

        if (_totalPoints > 0) {
          // Has accumulated points → SUCCESS with totals
          console.info(
            `[UserIdentified] Timer expired with ${_totalPoints} points ` +
            `from ${_bottleTypes.length} bottle(s) → SUCCESS`,
          );
          wsClient.sendMessage('session_ended', {
            reason: 'timer_expired_with_points',
            userId: _userId,
            totalPoints: _totalPoints,
            bottleTypes: _bottleTypes,
          });
          stateMachine.transition(STATES.SUCCESS, {
            points: _totalPoints,
            bottleTypes: [..._bottleTypes],
          });
        } else {
          // No bottles at all → ERROR
          console.warn('[UserIdentified] Timeout — no points_awarded received.');
          stateMachine.transition(STATES.ERROR, {
            message: 'Timed out waiting for bottle',
          });
        }
      }
    }, 1000);

    // ── Listen for POINTS_AWARDED from wsClient ──────────────────────────
    _pointsHandler = (e) => {
      const { points = 0, bottleType = 'unknown' } = e.detail;
      _totalPoints += points;
      _bottleTypes.push(bottleType);

      // Update UI: show running total
      if (_pointsStatusEl) {
        _pointsStatusEl.textContent =
          `${_bottleTypes.length} bottle(s) — ${_totalPoints} points earned`;
      }
      if (_waitingLabelEl) {
        _waitingLabelEl.textContent = 'Insert another bottle or press Complete';
      }

      // Extend countdown (capped at MAX_SESSION_S total session time)
      const totalSessionTime = _elapsedTime + _secondsLeft;
      if (totalSessionTime < MAX_SESSION_S) {
        const bonus = Math.min(BONUS_SECONDS, MAX_SESSION_S - totalSessionTime);
        _secondsLeft += bonus;
        console.info(
          `[UserIdentified] +${bonus}s bonus → ` +
          `countdown now ${_secondsLeft}s ` +
          `(session: ${_elapsedTime + _secondsLeft}s / ${MAX_SESSION_S}s cap)`,
        );
      } else {
        console.info(
          `[UserIdentified] Session cap ${MAX_SESSION_S}s reached — ` +
          `points added but no time bonus.`,
        );
      }

      console.info(
        `[UserIdentified] Bottle: ${bottleType}, +${points}pts. ` +
        `Total: ${_totalPoints}pts, ${_bottleTypes.length} bottle(s).`,
      );
    };
    document.addEventListener('POINTS_AWARDED', _pointsHandler);

    // ── "Complete" button handler ─────────────────────────────────────────
    const btn = container.querySelector('#btn-complete');
    _btnHandler = () => {
      if (_totalPoints > 0) {
        // Has accumulated points → end session early with SUCCESS
        wsClient.sendMessage('session_ended', {
          reason: 'user_completed',
          userId: _userId,
          totalPoints: _totalPoints,
          bottleTypes: _bottleTypes,
        });
        stateMachine.transition(STATES.SUCCESS, {
          points: _totalPoints,
          bottleTypes: [..._bottleTypes],
        });
      } else {
        // No bottles → just leave (old behavior)
        wsClient.sendMessage('session_ended', {
          reason: 'user_completed_early',
          userId: _userId,
        });
        stateMachine.transition(STATES.IDLE);
      }
    };
    btn.addEventListener('click', _btnHandler);

    console.info(
      `[UserIdentified] Mounted. User: "${userName}" (${_userId}). ` +
      `Timeout: ${INITIAL_TIMEOUT_S}s, cap: ${MAX_SESSION_S}s.`,
    );
  },

  unmount() {
    // Remove button listener
    if (_container && _btnHandler) {
      const btn = _container.querySelector('#btn-complete');
      if (btn) btn.removeEventListener('click', _btnHandler);
    }

    // Remove POINTS_AWARDED DOM listener — critical to prevent leaks
    if (_pointsHandler) {
      document.removeEventListener('POINTS_AWARDED', _pointsHandler);
      _pointsHandler = null;
    }

    _clearTimers();

    _container      = null;
    _btnHandler     = null;
    _userId         = null;
    _totalPoints    = 0;
    _bottleTypes    = [];
    _secondsLeft    = 0;
    _elapsedTime    = 0;
    _countdownEl    = null;
    _pointsStatusEl = null;
    _waitingLabelEl = null;

    console.info('[UserIdentified] Unmounted. All timers and listeners cleared.');
  },
};

// ─── Private helpers ──────────────────────────────────────────────────────────

/** Clears the countdown interval. */
function _clearTimers() {
  if (_tickInterval !== null) {
    clearInterval(_tickInterval);
    _tickInterval = null;
  }
}

/** Full cleanup: timers + POINTS_AWARDED listener. Called at top of mount() as guard. */
function _clearAll() {
  _clearTimers();
  if (_pointsHandler) {
    document.removeEventListener('POINTS_AWARDED', _pointsHandler);
    _pointsHandler = null;
  }
}
