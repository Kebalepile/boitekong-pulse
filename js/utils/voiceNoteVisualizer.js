const DEFAULT_BAR_COUNT = 20;
const IDLE_LEVELS = [0.22, 0.3, 0.18, 0.34, 0.2, 0.28];
const MAX_STORED_SAMPLES = 72;

export function createVoiceNoteVisualizer({
  waveformElement,
  progressLineElement,
  barCount = DEFAULT_BAR_COUNT
}) {
  const bars = [];
  let animationFrameId = null;
  let audioContext = null;
  let analyser = null;
  let streamSource = null;

  buildBars();
  renderStoredWaveform({ waveform: [], progressRatio: 0 });

  async function startRecording({ stream, maxDurationMs }) {
    stopRecording();

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextCtor) {
      throw new Error("Audio visualizer is not supported in this browser.");
    }

    audioContext = new AudioContextCtor();

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    streamSource = audioContext.createMediaStreamSource(stream);
    streamSource.connect(analyser);

    const timeDomainData = new Uint8Array(analyser.fftSize);
    const samples = [];
    const startedAt = performance.now();

    const tick = () => {
      if (!analyser) {
        return;
      }

      analyser.getByteTimeDomainData(timeDomainData);
      samples.push(roundLevel(calculateLevel(timeDomainData)));

      const elapsedMs = performance.now() - startedAt;
      const progressRatio = clamp(elapsedMs / maxDurationMs, 0, 1);

      renderStoredWaveform({
        waveform: samples,
        progressRatio,
        revealByProgress: true
      });

      animationFrameId = window.requestAnimationFrame(tick);
    };

    tick();

    return {
      stop() {
        stopRecording();
        return compressWaveform(samples);
      },
      cancel() {
        stopRecording();
        renderStoredWaveform({ waveform: [], progressRatio: 0 });
      }
    };
  }

  function renderStoredWaveform({
    waveform = [],
    progressRatio = 0,
    revealByProgress = false
  }) {
    const safeWaveform = expandWaveform(waveform, bars.length);
    const safeProgress = clamp(progressRatio, 0, 1);

    bars.forEach((bar, index) => {
      const position = getBarPosition(index, bars.length);
      const idleLevel = IDLE_LEVELS[index % IDLE_LEVELS.length];
      const waveformLevel = safeWaveform[index] ?? idleLevel;
      const shouldReveal = !revealByProgress || position <= safeProgress;
      const level = shouldReveal ? waveformLevel : idleLevel * 0.55;
      const scaleY = 0.35 + level * 1.85;

      bar.style.transform = `scaleY(${scaleY})`;
      bar.classList.toggle("voice-note-wave-bar-past", position <= safeProgress);
      bar.style.opacity = shouldReveal ? "1" : "0.28";
    });

    updateProgressLine(progressLineElement, safeProgress, waveform.length > 0);
  }

  function destroy() {
    stopRecording();
    waveformElement.replaceChildren();
    updateProgressLine(progressLineElement, 0, false);
  }

  return {
    startRecording,
    renderStoredWaveform,
    destroy
  };

  function buildBars() {
    waveformElement.replaceChildren();

    for (let index = 0; index < barCount; index += 1) {
      const bar = document.createElement("span");
      bar.className = "voice-note-wave-bar";
      waveformElement.appendChild(bar);
      bars.push(bar);
    }
  }

  function stopRecording() {
    if (animationFrameId) {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    if (streamSource) {
      streamSource.disconnect();
      streamSource = null;
    }

    if (analyser) {
      analyser.disconnect();
      analyser = null;
    }

    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
  }
}

export function normalizeVoiceWaveform(waveform = []) {
  if (!Array.isArray(waveform)) {
    return [];
  }

  return compressWaveform(
    waveform
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .map((value) => clamp(value, 0, 1))
  );
}

function calculateLevel(timeDomainData) {
  let sumSquares = 0;

  timeDomainData.forEach((value) => {
    const centered = (value - 128) / 128;
    sumSquares += centered * centered;
  });

  const rms = Math.sqrt(sumSquares / timeDomainData.length);
  return clamp(rms * 3.4, 0, 1);
}

function compressWaveform(samples = [], targetSize = MAX_STORED_SAMPLES) {
  if (!samples.length) {
    return [];
  }

  if (samples.length <= targetSize) {
    return samples.map(roundLevel);
  }

  const compressed = [];
  const bucketSize = samples.length / targetSize;

  for (let bucketIndex = 0; bucketIndex < targetSize; bucketIndex += 1) {
    const start = Math.floor(bucketIndex * bucketSize);
    const end = Math.floor((bucketIndex + 1) * bucketSize);
    const bucket = samples.slice(start, Math.max(end, start + 1));
    const average =
      bucket.reduce((sum, value) => sum + value, 0) / Math.max(bucket.length, 1);

    compressed.push(roundLevel(average));
  }

  return compressed;
}

function expandWaveform(waveform, size) {
  if (!waveform.length || size <= 0) {
    return [];
  }

  if (waveform.length === size) {
    return waveform;
  }

  return Array.from({ length: size }, (_, index) => {
    const position = getBarPosition(index, size);
    const sourceIndex = Math.round(position * (waveform.length - 1));
    return waveform[sourceIndex];
  });
}

function updateProgressLine(progressLineElement, progressRatio, isVisible) {
  if (!progressLineElement) {
    return;
  }

  progressLineElement.style.opacity = isVisible ? "1" : "0";
  progressLineElement.style.left = `${clamp(progressRatio, 0, 1) * 100}%`;
}

function getBarPosition(index, size) {
  if (size <= 1) {
    return 1;
  }

  return index / (size - 1);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundLevel(value) {
  return Math.round(clamp(value, 0, 1) * 100) / 100;
}
