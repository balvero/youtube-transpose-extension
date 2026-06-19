(function () {
  'use strict';

  // ── Inline styles (injected into Shadow DOM for full isolation) ──
  const STYLES = `
    :host {
      display: block;
      all: initial;
      font-family: 'Roboto', 'YouTube Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    }

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .bar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      background: linear-gradient(180deg, #1a1a1a 0%, #111 100%);
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      font-family: inherit;
      font-size: 13px;
      color: #aaa;
      user-select: none;
      -webkit-user-select: none;
      position: relative;
      z-index: 999;
    }

    .bar--embed {
      border-radius: 0 0 10px 10px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    }

    .bar--watch {
      border-radius: 0 0 8px 8px;
      margin-bottom: 4px;
    }

    /* ── Label & Key ── */
    .label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 500;
      letter-spacing: 0.3px;
      white-space: nowrap;
    }

    .icon {
      font-size: 18px;
      line-height: 1;
    }

    .key-display {
      margin-left: 10px;
      font-size: 13px;
      font-weight: 500;
      color: #888;
      background: rgba(255, 255, 255, 0.05);
      padding: 4px 10px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      transition: all 0.25s ease;
    }

    .key-display--active {
      color: #ff4e45;
      background: rgba(255, 78, 69, 0.1);
    }

    /* ── Controls ── */
    .controls {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
    }

    .btn {
      background: #272727;
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #fff;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      font-size: 18px;
      font-weight: 300;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
      line-height: 1;
      outline: none;
      -webkit-appearance: none;
      font-family: inherit;
    }

    .btn:hover:not(:disabled) {
      background: #3d3d3d;
      border-color: rgba(255, 255, 255, 0.15);
      transform: scale(1.1);
    }

    .btn:active:not(:disabled) {
      transform: scale(0.92);
      background: #1a1a1a;
    }

    .btn:disabled {
      opacity: 0.25;
      cursor: default;
    }

    /* ── Value display ── */
    .value {
      font-size: 15px;
      font-weight: 600;
      color: #e0e0e0;
      min-width: 52px;
      text-align: center;
      font-variant-numeric: tabular-nums;
      transition: color 0.25s ease, text-shadow 0.25s ease;
      padding: 0 2px;
    }

    .value--active {
      color: #ff4e45;
      text-shadow: 0 0 12px rgba(255, 78, 69, 0.3);
    }

    /* ── Reset button ── */
    .reset {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #888;
      font-size: 11px;
      font-weight: 500;
      padding: 5px 12px;
      border-radius: 14px;
      cursor: pointer;
      transition: all 0.15s ease;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      outline: none;
      white-space: nowrap;
      -webkit-appearance: none;
      font-family: inherit;
    }

    .reset:hover {
      background: #272727;
      color: #fff;
      border-color: rgba(255, 255, 255, 0.15);
    }

    .reset:active {
      transform: scale(0.95);
    }

    .reset--hidden {
      opacity: 0;
      pointer-events: none;
    }
  `;

  const MIN_SEMITONES = -12;
  const MAX_SEMITONES = 12;

  /**
   * Creates a transpose control bar with Shadow DOM style isolation.
   *
   * @param {Object} options
   * @param {'embed'|'watch'} options.variant  — visual variant
   * @param {function(number)} options.onChange — called with semitone value on change
   * @returns {{ element: HTMLElement, setSemitones: function, getSemitones: function, destroy: function }}
   */
  function createTransposeUI(options) {
    const { variant = 'embed', onChange } = options;

    // Host element with closed Shadow DOM (no page CSS leaks in)
    const host = document.createElement('div');
    host.setAttribute('data-yt-transpose', '');
    const shadow = host.attachShadow({ mode: 'closed' });

    // Inject styles
    const style = document.createElement('style');
    style.textContent = STYLES;
    shadow.appendChild(style);

    // ── Build DOM ──
    const bar = document.createElement('div');
    bar.className = 'bar bar--' + variant;

    // Label with Tooltip
    const label = document.createElement('div');
    label.className = 'label';
    label.title = 'Transpose';
    label.style.cursor = 'help';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'icon';
    // Up/Down Arrows SVG
    iconSpan.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15l5 5 5-5"/><path d="M7 9l5-5 5 5"/></svg>';

    const keyDisplay = document.createElement('div');
    keyDisplay.className = 'key-display';
    keyDisplay.textContent = 'Chord: Waiting...';

    label.appendChild(iconSpan);
    label.appendChild(keyDisplay);

    // Controls wrapper
    const controls = document.createElement('div');
    controls.className = 'controls';

    const btnDown = document.createElement('button');
    btnDown.className = 'btn';
    btnDown.textContent = '−';
    btnDown.setAttribute('aria-label', 'Transpose down one semitone');

    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'value';
    valueDisplay.textContent = '0 st';

    const btnUp = document.createElement('button');
    btnUp.className = 'btn';
    btnUp.textContent = '+';
    btnUp.setAttribute('aria-label', 'Transpose up one semitone');

    const btnReset = document.createElement('button');
    btnReset.className = 'reset reset--hidden';
    btnReset.textContent = 'Reset';
    btnReset.setAttribute('aria-label', 'Reset transpose to zero');

    controls.appendChild(btnDown);
    controls.appendChild(valueDisplay);
    controls.appendChild(btnUp);
    controls.appendChild(btnReset);

    bar.appendChild(label);
    bar.appendChild(controls);
    shadow.appendChild(bar);

    // ── State ──
    let semitones = 0;
    let baseKeyIndex = -1;
    let baseIsMinor = false;

    function update() {
      const sign = semitones > 0 ? '+' : '';
      valueDisplay.textContent = sign + semitones + ' st';
      valueDisplay.className = semitones !== 0 ? 'value value--active' : 'value';
      btnDown.disabled = semitones <= MIN_SEMITONES;
      btnUp.disabled = semitones >= MAX_SEMITONES;
      btnReset.className = semitones !== 0 ? 'reset' : 'reset reset--hidden';

      if (baseKeyIndex >= 0 && window.formatTransposedKey) {
        keyDisplay.textContent = 'Chord: ' + window.formatTransposedKey(baseKeyIndex, baseIsMinor, semitones);
        keyDisplay.className = semitones !== 0 ? 'key-display key-display--active' : 'key-display';
      }

      if (onChange) onChange(semitones);
    }

    // ── Event listeners ──
    btnDown.addEventListener('click', (e) => {
      e.stopPropagation();
      if (semitones > MIN_SEMITONES) {
        semitones--;
        update();
      }
    });

    btnUp.addEventListener('click', (e) => {
      e.stopPropagation();
      if (semitones < MAX_SEMITONES) {
        semitones++;
        update();
      }
    });

    btnReset.addEventListener('click', (e) => {
      e.stopPropagation();
      if (semitones !== 0) {
        semitones = 0;
        update();
      }
    });

    return {
      element: host,

      setSemitones(value) {
        semitones = Math.max(
          MIN_SEMITONES,
          Math.min(MAX_SEMITONES, Math.round(value))
        );
        update();
      },

      setDetectedKey(keyIndex, isMinor) {
        // Prevent update loop if it's the same key
        if (baseKeyIndex === keyIndex && baseIsMinor === isMinor) return;
        baseKeyIndex = keyIndex;
        baseIsMinor = isMinor;
        update();
      },

      getSemitones() {
        return semitones;
      },

      destroy() {
        host.remove();
      },
    };
  }

  // Expose globally in the content script's isolated world
  window.YTTransposeUI = { create: createTransposeUI };
})();
