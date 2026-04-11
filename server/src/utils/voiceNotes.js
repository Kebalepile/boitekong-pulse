import { AppError } from "./appError.js";
import { MAX_VOICE_NOTE_DURATION_MS } from "./validators.js";

function normalizeWaveform(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const waveform = value
    .filter((entry) => Number.isFinite(entry))
    .map((entry) => Math.max(0, Math.min(1, Number(entry))));

  return waveform.length > 0 ? waveform : undefined;
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBase64(value) {
  return trimString(value).replace(/\s+/g, "");
}

function getVoiceNoteAudioBuffer(voiceNote) {
  const audioData = voiceNote?.audioData;

  if (!audioData) {
    return null;
  }

  if (Buffer.isBuffer(audioData)) {
    return audioData;
  }

  if (audioData instanceof Uint8Array) {
    return Buffer.from(audioData);
  }

  if (Array.isArray(audioData?.data)) {
    return Buffer.from(audioData.data);
  }

  if (audioData?._bsontype === "Binary" && audioData.buffer) {
    return Buffer.from(audioData.buffer);
  }

  if (typeof audioData?.value === "function") {
    try {
      return Buffer.from(audioData.value(true));
    } catch {
      return null;
    }
  }

  return null;
}

export function getVoiceNoteAudioBase64(voiceNote) {
  return normalizeBase64(voiceNote?.audioBase64);
}

function normalizeDurationMs(voiceNote, maxDurationMs) {
  if (Number.isFinite(voiceNote?.durationMs)) {
    return Math.min(Math.max(0, Number(voiceNote.durationMs)), maxDurationMs);
  }

  if (Number.isFinite(voiceNote?.durationSeconds)) {
    return Math.min(Math.max(0, Number(voiceNote.durationSeconds) * 1000), maxDurationMs);
  }

  return 0;
}

function normalizeSize(voiceNote, audioBuffer) {
  if (Number.isFinite(voiceNote?.size)) {
    return Math.max(0, Number(voiceNote.size));
  }

  if (Number.isFinite(voiceNote?.sizeBytes)) {
    return Math.max(0, Number(voiceNote.sizeBytes));
  }

  return audioBuffer?.length || 0;
}

function makeVoiceNoteAudioError(field) {
  return new AppError("Voice note audio is invalid.", {
    statusCode: 400,
    code: "VOICE_NOTE_AUDIO_INVALID",
    field
  });
}

function decodeVoiceNoteAudio(base64Audio, field) {
  if (!base64Audio) {
    return null;
  }

  try {
    const audioBuffer = Buffer.from(base64Audio, "base64");
    const normalizedBase64 = audioBuffer.toString("base64").replace(/=+$/, "");
    const safeInput = base64Audio.replace(/=+$/, "");

    if (!audioBuffer.length || normalizedBase64 !== safeInput) {
      throw new Error("Invalid base64 voice note payload.");
    }

    return audioBuffer;
  } catch {
    throw makeVoiceNoteAudioError(field);
  }
}

export function hasVoiceNoteContent(voiceNote) {
  const remoteUrl = trimString(voiceNote?.url);

  return Boolean(
    getVoiceNoteAudioBase64(voiceNote) ||
      getVoiceNoteAudioBuffer(voiceNote)?.length ||
      /^https?:\/\//i.test(remoteUrl)
  );
}

export function normalizeVoiceNoteInput(
  voiceNote,
  {
    field = "voiceNote",
    maxDurationMs = MAX_VOICE_NOTE_DURATION_MS
  } = {}
) {
  if (!hasVoiceNoteContent(voiceNote)) {
    return null;
  }

  const audioBase64 = getVoiceNoteAudioBase64(voiceNote);
  const audioBuffer = audioBase64
    ? decodeVoiceNoteAudio(audioBase64, field)
    : getVoiceNoteAudioBuffer(voiceNote);
  const durationMs = normalizeDurationMs(voiceNote, maxDurationMs);
  const size = normalizeSize(voiceNote, audioBuffer);

  return {
    audioData: audioBuffer?.length ? audioBuffer : undefined,
    url:
      typeof voiceNote?.url === "string" && /^https?:\/\//i.test(voiceNote.url.trim())
        ? voiceNote.url.trim()
        : "",
    storageKey: typeof voiceNote?.storageKey === "string" ? voiceNote.storageKey.trim() : "",
    mimeType:
      typeof voiceNote?.mimeType === "string" && voiceNote.mimeType.trim()
        ? voiceNote.mimeType.trim()
        : "audio/webm",
    durationMs,
    durationSeconds: Math.round(durationMs / 1000),
    size,
    sizeBytes: size,
    waveform: normalizeWaveform(voiceNote?.waveform)
  };
}

export function serializeVoiceNote(
  voiceNote,
  {
    maxDurationMs = MAX_VOICE_NOTE_DURATION_MS
  } = {}
) {
  if (!hasVoiceNoteContent(voiceNote)) {
    return null;
  }

  const audioBuffer = getVoiceNoteAudioBuffer(voiceNote);
  const audioBase64 = audioBuffer?.length
    ? audioBuffer.toString("base64")
    : getVoiceNoteAudioBase64(voiceNote);
  const durationMs = normalizeDurationMs(voiceNote, maxDurationMs);
  const size = normalizeSize(voiceNote, audioBuffer);

  return {
    audioBase64,
    url: trimString(voiceNote?.url),
    storageKey: trimString(voiceNote?.storageKey),
    mimeType:
      typeof voiceNote?.mimeType === "string" && voiceNote.mimeType.trim()
        ? voiceNote.mimeType.trim()
        : "audio/webm",
    durationMs,
    size,
    waveform: Array.isArray(voiceNote?.waveform) ? voiceNote.waveform : []
  };
}
