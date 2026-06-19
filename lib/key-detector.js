(function () {
  'use strict';

  // Pitch classes starting from C
  const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  // Krumhansl-Schmuckler key profiles
  // Weights representing the relative importance of each pitch class in a key
  const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  function computeCorrelation(chroma, profile) {
    let sumChroma = 0;
    let sumProfile = 0;
    let sumProduct = 0;
    let sumChromaSq = 0;
    let sumProfileSq = 0;

    const n = chroma.length;
    for (let i = 0; i < n; i++) {
      sumChroma += chroma[i];
      sumProfile += profile[i];
    }

    const meanChroma = sumChroma / n;
    const meanProfile = sumProfile / n;

    for (let i = 0; i < n; i++) {
      const devChroma = chroma[i] - meanChroma;
      const devProfile = profile[i] - meanProfile;
      sumProduct += devChroma * devProfile;
      sumChromaSq += devChroma * devChroma;
      sumProfileSq += devProfile * devProfile;
    }

    const denominator = Math.sqrt(sumChromaSq * sumProfileSq);
    if (denominator === 0) return 0;
    return sumProduct / denominator;
  }

  // Rotate an array to the right by 'shift' places
  function rotateArray(arr, shift) {
    const len = arr.length;
    shift = shift % len;
    if (shift < 0) shift += len;
    return arr.slice(-shift).concat(arr.slice(0, -shift));
  }

  /**
   * YTKeyDetector — Estimates the musical key from an audio stream using Meyda
   */
  class YTKeyDetector {
    constructor(audioContext, sourceNode, onKeyDetected) {
      this.ctx = audioContext;
      this.onKeyDetected = onKeyDetected;
      this.isActive = false;

      // Accumulator for the chroma vector to average out short-term noise
      this.chromaAccumulator = new Float32Array(12);
      this.framesAnalyzed = 0;
      this.framesToAnalyze = 50; // Output a key every ~50 frames

      // Set up Meyda Analyzer
      if (!window.Meyda) {
        console.warn('[YouTube Transpose] Meyda is not available. Key detection disabled.');
        return;
      }

      this.analyzer = window.Meyda.createMeydaAnalyzer({
        audioContext: this.ctx,
        source: sourceNode,
        bufferSize: 4096,
        featureExtractors: ['chroma'],
        callback: (features) => this.onMeydaCallback(features),
      });
    }

    start() {
      if (this.analyzer && !this.isActive) {
        this.analyzer.start();
        this.isActive = true;
      }
    }

    stop() {
      if (this.analyzer && this.isActive) {
        this.analyzer.stop();
        this.isActive = false;
      }
    }

    onMeydaCallback(features) {
      if (!features || !features.chroma) return;

      const chroma = features.chroma;
      let totalEnergy = 0;
      for (let i = 0; i < 12; i++) {
        totalEnergy += chroma[i];
      }

      if (totalEnergy < 0.1) {
        // Silence or very low volume, slowly decay the accumulator
        for (let i = 0; i < 12; i++) {
          this.chromaAccumulator[i] *= 0.95;
        }
        return;
      }

      // Smooth the chroma vector using an Exponential Moving Average (EMA)
      // This creates a rolling window of about 0.5 to 1 second
      for (let i = 0; i < 12; i++) {
        this.chromaAccumulator[i] = (this.chromaAccumulator[i] * 0.8) + (chroma[i] * 0.2);
      }
      this.framesAnalyzed++;

      // Once we have a tiny bit of history, estimate immediately and continuously
      if (this.framesAnalyzed >= 5) {
        this.estimateKey();
      }
    }

    estimateKey() {
      let maxCorrelation = -1;
      let bestKeyIndex = -1;
      let isMinor = false;

      // Test all 12 major keys
      for (let i = 0; i < 12; i++) {
        const profile = rotateArray(MAJOR_PROFILE, i);
        const corr = computeCorrelation(this.chromaAccumulator, profile);
        if (corr > maxCorrelation) {
          maxCorrelation = corr;
          bestKeyIndex = i;
          isMinor = false;
        }
      }

      // Test all 12 minor keys
      for (let i = 0; i < 12; i++) {
        const profile = rotateArray(MINOR_PROFILE, i);
        const corr = computeCorrelation(this.chromaAccumulator, profile);
        if (corr > maxCorrelation) {
          maxCorrelation = corr;
          bestKeyIndex = i;
          isMinor = true;
        }
      }

      // If correlation is too low, it's likely just speech or noise
      if (maxCorrelation < 0.3) return;

      if (this.onKeyDetected) {
        this.onKeyDetected(bestKeyIndex, isMinor);
      }
    }
  }

  window.YTKeyDetector = YTKeyDetector;
  window.PITCH_CLASSES = PITCH_CLASSES;

  /**
   * Helper to format a transposed key
   */
  window.formatTransposedKey = function(baseKeyIndex, isMinor, semitones) {
    if (baseKeyIndex < 0) return 'Analyzing...';
    
    // Calculate new key index and wrap around 12
    let newIndex = (baseKeyIndex + semitones) % 12;
    if (newIndex < 0) newIndex += 12;

    const keyName = PITCH_CLASSES[newIndex];
    return keyName + (isMinor ? 'm' : '');
  };

})();
