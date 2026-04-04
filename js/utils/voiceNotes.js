import { normalizeVoiceWaveform } from "./voiceNoteVisualizer.js";

const PREFERRED_VOICE_NOTE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus"
];

export const MAX_VOICE_NOTE_DURATION_MS = 60000;

export function isVoiceNoteRecordingSupported() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  return (
    typeof window.MediaRecorder !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

export function getSupportedVoiceNoteMimeType() {
  if (!isVoiceNoteRecordingSupported()) {
    return null;
  }

  if (typeof window.MediaRecorder?.isTypeSupported !== "function") {
    return PREFERRED_VOICE_NOTE_MIME_TYPES[0];
  }

  return (
    PREFERRED_VOICE_NOTE_MIME_TYPES.find((mimeType) =>
      window.MediaRecorder.isTypeSupported(mimeType)
    ) || null
  );
}

export function getVoiceNoteFeatureStatus() {
  const supported = isVoiceNoteRecordingSupported();

  return {
    supported,
    mimeType: getSupportedVoiceNoteMimeType(),
    message: supported
      ? "Optional voice note available. Record in-browser up to 60 seconds."
      : "Voice notes need MediaRecorder support in this browser."
  };
}

export async function startVoiceNoteRecording({
  maxDurationMs = MAX_VOICE_NOTE_DURATION_MS
} = {}) {
  if (!isVoiceNoteRecordingSupported()) {
    throw new Error("Voice note recording is not supported in this browser.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const preferredMimeType = getSupportedVoiceNoteMimeType();
  const mediaRecorder = preferredMimeType
    ? new window.MediaRecorder(stream, { mimeType: preferredMimeType })
    : new window.MediaRecorder(stream);
  const chunks = [];
  const startedAt = Date.now();
  let cancelled = false;
  let completed = false;

  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  });

  const stopPromise = new Promise((resolve, reject) => {
    mediaRecorder.addEventListener("stop", async () => {
      stopStream(stream);

      if (cancelled) {
        resolve(null);
        return;
      }

      try {
        const blob = new Blob(chunks, {
          type: mediaRecorder.mimeType || preferredMimeType || "audio/webm"
        });

        if (blob.size === 0) {
          reject(new Error("No voice note audio was captured."));
          return;
        }

        completed = true;
        resolve(
          await createVoiceNotePayload({
            blob,
            startedAt,
            maxDurationMs
          })
        );
      } catch (error) {
        reject(
          error instanceof Error ? error : new Error("Failed to build voice note.")
        );
      }
    });

    mediaRecorder.addEventListener("error", () => {
      stopStream(stream);
      reject(new Error("Voice note recording failed."));
    });
  });

  mediaRecorder.start();

  const autoStopTimeoutId = window.setTimeout(() => {
    if (mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  }, maxDurationMs);

  return {
    maxDurationMs,
    startedAt,
    stream,
    result: stopPromise,
    stop: async () => {
      clearTimeout(autoStopTimeoutId);

      if (mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }

      return stopPromise;
    },
    cancel: () => {
      clearTimeout(autoStopTimeoutId);
      cancelled = true;

      if (mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        return;
      }

      if (!completed) {
        stopStream(stream);
      }
    }
  };
}

export function normalizeVoiceNote(voiceNote) {
  if (!voiceNote) {
    return null;
  }

  const safeSource =
    typeof voiceNote.dataUrl === "string" && voiceNote.dataUrl.startsWith("data:audio/")
      ? voiceNote.dataUrl
      : null;

  if (!safeSource) {
    return null;
  }

  const durationMs = Number.isFinite(voiceNote.durationMs)
    ? Math.min(Math.max(0, voiceNote.durationMs), MAX_VOICE_NOTE_DURATION_MS)
    : 0;

  return {
    dataUrl: safeSource,
    mimeType:
      typeof voiceNote.mimeType === "string" && voiceNote.mimeType
        ? voiceNote.mimeType
        : "audio/webm",
    waveform: normalizeVoiceWaveform(voiceNote.waveform),
    durationMs,
    size: Number.isFinite(voiceNote.size) ? Math.max(0, voiceNote.size) : 0
  };
}

export function formatVoiceNoteDuration(durationMs = 0) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function configureVoiceNoteAudio(audio, source = "", options = {}) {
  if (!audio) {
    return;
  }

  const { showNativeControls = false } = options;

  audio.controls = showNativeControls;
  audio.hidden = !showNativeControls;
  audio.preload = "metadata";
  audio.src = source;
  audio.disableRemotePlayback = true;
  audio.controlsList = "nodownload noplaybackrate";
  audio.setAttribute("controlsList", "nodownload noplaybackrate");
  audio.oncontextmenu = (event) => {
    event.preventDefault();
  };
}

async function createVoiceNotePayload({ blob, startedAt, maxDurationMs }) {
  return {
    dataUrl: await readBlobAsDataUrl(blob),
    mimeType: blob.type || "audio/webm",
    durationMs: Math.min(Date.now() - startedAt, maxDurationMs),
    size: blob.size
  };
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      resolve(String(reader.result || ""));
    });

    reader.addEventListener("error", () => {
      reject(new Error("Failed to read recorded audio."));
    });

    reader.readAsDataURL(blob);
  });
}

function stopStream(stream) {
  stream.getTracks().forEach((track) => track.stop());
}
