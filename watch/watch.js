(function () {
  'use strict';

  let pipeline = null;
  let currentUI = null;
  let initializingLock = false;

  /**
   * Finds the main video element on a YouTube watch page.
   */
  function findVideo() {
    return (
      document.querySelector('video.html5-main-video') ||
      document.querySelector('#movie_player video') ||
      document.querySelector('video')
    );
  }

  /**
   * Waits for an element matching the selector to appear in the DOM.
   */
  function waitForElement(selector, timeout) {
    if (timeout === undefined) timeout = 10000;
    return new Promise((resolve) => {
      const el = document.querySelector(selector);
      if (el) {
        resolve(el);
        return;
      }

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          observer.disconnect();
          resolve(found);
        }
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });

      setTimeout(() => {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }, timeout);
    });
  }

  /**
   * Ensures the audio pipeline is created and connected to the video.
   * Called lazily on the first pitch-change interaction.
   */
  async function ensurePipeline() {
    if (pipeline && pipeline.isActive()) return;

    const video = findVideo();
    if (!video) {
      console.warn('[YouTube Transpose] No video element found on watch page');
      return;
    }

    // Don't re-create if pipeline already exists (createMediaElementSource is one-shot)
    if (pipeline) return;

    try {
      pipeline = await window.YTAudioPipeline.create(video, (keyIndex, isMinor) => {
        if (currentUI) {
          currentUI.setDetectedKey(keyIndex, isMinor);
        }
      });
      console.log('[YouTube Transpose] Pipeline initialized on watch page');
    } catch (err) {
      console.error('[YouTube Transpose] Watch pipeline error:', err);

      if (err.name === 'InvalidStateError') {
        console.warn(
          '[YouTube Transpose] Video element already has a MediaElementSource'
        );
      }
    }
  }

  /**
   * Initializes the transpose UI below the YouTube player.
   * Re-entrant safe via initializingLock.
   */
  async function initialize() {
    if (!location.pathname.startsWith('/watch')) return;
    if (initializingLock) return;
    initializingLock = true;

    try {
      const belowContainer = await waitForElement('#below');
      if (!belowContainer) {
        console.warn('[YouTube Transpose] #below not found');
        return;
      }

      // If UI is still in the DOM, nothing to do
      if (currentUI && document.contains(currentUI.element)) return;

      // Clean up detached UI
      if (currentUI) {
        currentUI.destroy();
        currentUI = null;
      }

      // Preserve pitch setting across SPA navigations
      const savedSemitones = pipeline ? pipeline.getSemitones() : 0;

      currentUI = window.YTTransposeUI.create({
        variant: 'watch',
        onChange: async (semitones) => {
          await ensurePipeline();
          if (pipeline) {
            await pipeline.resume();
            pipeline.setPitch(semitones);
          }
        },
      });

      // Provide full width for host element
      currentUI.element.style.width = '100%';
      currentUI.element.style.display = 'block';
      currentUI.element.style.marginBottom = '12px';

      // Insert bar as the first child of #below
      belowContainer.insertBefore(currentUI.element, belowContainer.firstChild);

      // Automatically start audio pipeline (for chord detection) when video plays
      const video = findVideo();
      if (video) {
        video.addEventListener('playing', ensurePipeline);
        if (!video.paused) ensurePipeline();
      }

      // Restore pitch if navigating between videos
      if (savedSemitones !== 0) {
        currentUI.setSemitones(savedSemitones);
      }
    } catch (err) {
      console.error('[YouTube Transpose] Watch init error:', err);
    } finally {
      initializingLock = false;
    }
  }

  // ── Entry point ──
  if (
    document.readyState === 'complete' ||
    document.readyState === 'interactive'
  ) {
    initialize();
  } else {
    document.addEventListener('DOMContentLoaded', initialize);
  }

  // ── SPA navigation: YouTube fires this on client-side route changes ──
  document.addEventListener('yt-navigate-finish', () => {
    setTimeout(initialize, 500);
  });

  // Fallback for popstate-based navigation
  window.addEventListener('popstate', () => {
    setTimeout(initialize, 500);
  });
})();
