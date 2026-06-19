(function () {
  'use strict';

  const MSG_TYPE = 'YT_TRANSPOSE_EXT';
  let pipeline = null;
  let initPromise = null;

  /**
   * Waits for the <video> element to appear in the YouTube embed iframe.
   */
  function findVideo() {
    return new Promise((resolve) => {
      const video = document.querySelector('video');
      if (video) {
        resolve(video);
        return;
      }

      const observer = new MutationObserver(() => {
        const el = document.querySelector('video');
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });

      // Safety timeout: stop waiting after 15 seconds
      setTimeout(() => {
        observer.disconnect();
        resolve(document.querySelector('video'));
      }, 15000);
    });
  }

  /**
   * Initializes the audio pipeline (called once, on first pitch change).
   */
  async function initPipeline() {
    try {
      const video = await findVideo();
      if (!video) {
        console.warn('[YouTube Transpose] No video element found in embed');
        return null;
      }

      const p = await window.YTAudioPipeline.create(video, (keyIndex, isMinor) => {
        try {
          window.parent.postMessage({ type: MSG_TYPE, action: 'keyDetected', keyIndex: keyIndex, isMinor: isMinor }, '*');
        } catch (e) {
          // Ignore
        }
      });
      console.log('[YouTube Transpose] Pipeline initialized in embed');
      return p;
    } catch (err) {
      console.error('[YouTube Transpose] Embed pipeline error:', err);
      return null;
    }
  }

  /**
   * Handles a pitch-change request from the parent page.
   */
  async function handlePitchChange(semitones) {
    // Lazy-init: create pipeline on first request
    if (!pipeline) {
      // Avoid concurrent init
      if (!initPromise) {
        initPromise = initPipeline();
      }
      pipeline = await initPromise;
      if (!pipeline) return;
    }

    await pipeline.resume();
    pipeline.setPitch(semitones);
  }

  // ── Listen for postMessage from parent page's content script ──
  window.addEventListener('message', (event) => {
    if (!event.data || event.data.type !== MSG_TYPE) return;

    if (event.data.action === 'setPitch') {
      handlePitchChange(event.data.semitones);
    }
  });

  // Notify parent that embed script is loaded
  try {
    window.parent.postMessage({ type: MSG_TYPE, action: 'ready' }, '*');
  } catch (_) {
    // Silently fail if parent isn't accessible
  }

  // Embed video play auto-init for chord detection
  findVideo().then(video => {
    if (!video) return;
    const triggerInit = async () => {
      if (!pipeline && !initPromise) {
        initPromise = initPipeline();
      }
      if (!pipeline && initPromise) {
        pipeline = await initPromise;
      }
    };
    video.addEventListener('playing', triggerInit);
    if (!video.paused) triggerInit();
  });
})();
