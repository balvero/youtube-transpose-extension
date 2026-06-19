(function () {
  'use strict';

  /**
   * Creates a pitch-shifting node using SoundTouchJS.
   * Uses high-quality WSOLA algorithm.
   */
  function createPitchShifter(ctx) {
    const SP_BUFFER_SIZE = 4096;
    const node = ctx.createScriptProcessor(SP_BUFFER_SIZE, 2, 2);

    // Create SoundTouch instance
    const st = new window.SoundTouchJS.SoundTouch();
    st.pitchSemitones = 0;
    let currentSemitones = 0;

    // Bridge: Push (Web Audio) to Pull (SoundTouch)
    // We use a circular buffer to hold incoming audio.
    const RING_BUFFER_SIZE = 65536;
    const RING_BUFFER_MASK = RING_BUFFER_SIZE - 1;
    const inL = new Float32Array(RING_BUFFER_SIZE);
    const inR = new Float32Array(RING_BUFFER_SIZE);
    let writePos = 0;
    let readPos = 0;

    // Pre-fill the ring buffer with some silence (latency)
    // This gives SoundTouch enough lookahead to avoid under-runs.
    const PREFILL = SP_BUFFER_SIZE * 2;
    writePos = PREFILL;

    // Dummy source that SimpleFilter will pull from
    const dummySource = {
      extract: function (target, numFrames) {
        // How many frames are available to read?
        const availableFrames = (writePos - readPos + RING_BUFFER_SIZE) & RING_BUFFER_MASK;
        const framesToRead = Math.min(numFrames, availableFrames);

        for (let i = 0; i < framesToRead; i++) {
          const pos = (readPos + i) & RING_BUFFER_MASK;
          target[i * 2] = inL[pos];
          target[i * 2 + 1] = inR[pos];
        }

        readPos = (readPos + framesToRead) & RING_BUFFER_MASK;

        // SoundTouch expects exactly the requested frames, pad if necessary
        for (let i = framesToRead; i < numFrames; i++) {
          target[i * 2] = 0;
          target[i * 2 + 1] = 0;
        }

        return framesToRead; 
      }
    };

    // Filter wraps the source and the SoundTouch pipe
    const filter = new window.SoundTouchJS.SimpleFilter(dummySource, st);
    
    // Holding buffer for the output from SoundTouch
    const outBuffer = new Float32Array(SP_BUFFER_SIZE * 2);

    node.onaudioprocess = function (event) {
      const inputBuffer = event.inputBuffer;
      const outputBuffer = event.outputBuffer;

      const inDataL = inputBuffer.getChannelData(0);
      const inDataR = inputBuffer.numberOfChannels > 1 ? inputBuffer.getChannelData(1) : inDataL;
      
      const blockSize = inDataL.length;
      
      // 1. Write incoming samples to ring buffer
      for (let i = 0; i < blockSize; i++) {
        const pos = (writePos + i) & RING_BUFFER_MASK;
        inL[pos] = inDataL[i];
        inR[pos] = inDataR[i];
      }
      writePos = (writePos + blockSize) & RING_BUFFER_MASK;
      
      // 2. Pull processed samples from SoundTouch via the filter
      const extracted = filter.extract(outBuffer, blockSize);
      
      // 3. De-interleave and output
      const outDataL = outputBuffer.getChannelData(0);
      const outDataR = outputBuffer.numberOfChannels > 1 ? outputBuffer.getChannelData(1) : null;
      
      for (let i = 0; i < extracted; i++) {
        outDataL[i] = outBuffer[i * 2];
        if (outDataR) {
          outDataR[i] = outBuffer[i * 2 + 1];
        }
      }
      
      // Fill the rest with zeros if SoundTouch didn't return enough (e.g., buffering)
      for (let i = extracted; i < blockSize; i++) {
        outDataL[i] = 0;
        if (outDataR) {
          outDataR[i] = 0;
        }
      }
    };

    return {
      node: node,
      setPitch: function (semitones) {
        currentSemitones = semitones;
        st.pitchSemitones = semitones;
      },
      getSemitones: function () {
        return currentSemitones;
      },
    };
  }

  /**
   * YTAudioPipeline — Creates and manages the pitch-shifting pipeline.
   *
   * Pipeline: video → MediaElementSource → ScriptProcessorNode → destination
   *
   * Uses ScriptProcessorNode instead of AudioWorklet to avoid CSP issues
   * on YouTube (which blocks blob: URLs and non-whitelisted script sources).
   */
  window.YTAudioPipeline = {
    /**
     * @param {HTMLVideoElement} videoElement
     * @param {function} onKeyDetected
     * @returns {Promise<{setPitch, getSemitones, isActive, resume, destroy}>}
     */
    async create(videoElement, onKeyDetected) {
      const ctx = new AudioContext();

      // Resume if suspended (autoplay policy)
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch (err) {
          console.warn('[YouTube Transpose] AudioContext resume failed:', err);
        }
      }

      // Build pipeline: video → source → pitch shifter → speakers
      const source = ctx.createMediaElementSource(videoElement);
      const shifter = createPitchShifter(ctx);

      source.connect(shifter.node);
      shifter.node.connect(ctx.destination);

      let keyDetector = null;
      if (window.YTKeyDetector) {
        // We connect the KeyDetector to the raw source (before pitch shift)
        // so we always detect the original key, and then we format it manually in the UI
        keyDetector = new window.YTKeyDetector(ctx, source, onKeyDetected);
        keyDetector.start();
      }

      return {
        setPitch: function (semitones) {
          shifter.setPitch(semitones);
        },

        getSemitones: function () {
          return shifter.getSemitones();
        },

        isActive: function () {
          return ctx.state !== 'closed';
        },

        resume: async function () {
          if (ctx.state === 'suspended') {
            await ctx.resume();
          }
        },

        destroy: function () {
          try {
            if (keyDetector) keyDetector.stop();
            source.disconnect();
            shifter.node.disconnect();
            ctx.close();
          } catch (e) {
            console.warn('[YouTube Transpose] Pipeline cleanup error:', e);
          }
        },
      };
    },
  };
})();
