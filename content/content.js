(function () {
  'use strict';

  const YOUTUBE_EMBED_RE =
    /^https?:\/\/(?:www\.)?(?:youtube\.com|youtube-nocookie\.com)\/embed\//;
  const PROCESSED_ATTR = 'data-yt-transpose-processed';
  const MSG_TYPE = 'YT_TRANSPOSE_EXT';

  /**
   * Checks if an iframe is a YouTube embed.
   */
  function isYouTubeEmbed(iframe) {
    return iframe.src && YOUTUBE_EMBED_RE.test(iframe.src);
  }

  /**
   * Injects a transpose control bar below a YouTube embed iframe.
   */
  function processIframe(iframe) {
    if (iframe.hasAttribute(PROCESSED_ATTR)) return;
    if (!isYouTubeEmbed(iframe)) return;

    iframe.setAttribute(PROCESSED_ATTR, 'true');

    const ui = window.YTTransposeUI.create({
      variant: 'embed',
      onChange(semitones) {
        try {
          iframe.contentWindow.postMessage(
            { type: MSG_TYPE, action: 'setPitch', semitones: semitones },
            '*'
          );
        } catch (e) {
          console.warn('[YouTube Transpose] postMessage to embed failed:', e);
        }
      },
    });

    // Insert the bar right after the iframe
    if (iframe.parentNode) {
      iframe.parentNode.insertBefore(ui.element, iframe.nextSibling);
    }

    // Match bar width to iframe width
    function updateWidth() {
      ui.element.style.width = iframe.offsetWidth + 'px';
    }
    updateWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateWidth);
      ro.observe(iframe);
    }

    window.addEventListener('message', (event) => {
      if (!event.data || event.data.type !== MSG_TYPE) return;
      if (event.data.action === 'keyDetected' && event.source === iframe.contentWindow) {
        ui.setDetectedKey(event.data.keyIndex, event.data.isMinor);
      }
    });
  }

  /**
   * Scans the page for YouTube embed iframes and processes them.
   */
  function scanForIframes() {
    const iframes = document.querySelectorAll('iframe');
    for (let i = 0; i < iframes.length; i++) {
      processIframe(iframes[i]);
    }
  }

  // ── Initial scan ──
  scanForIframes();

  // ── Watch for dynamically added iframes (SPAs, lazy-loaded content) ──
  if (document.body) {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          scanForIframes();
          return;
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
