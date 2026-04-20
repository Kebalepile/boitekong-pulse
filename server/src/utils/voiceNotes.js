import { AppError } from "./appError.js";
import {
  MAX_VOICE_NOTE_AUDIO_BYTES,
  MAX_VOICE_NOTE_DURATION_MS
} from "./validators.js";

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

function getBase64PayloadSizeBytes(value) {
  const normalizedValue = normalizeBase64(value);

  if (!normalizedValue) {
    return 0;
  }

  const paddingLength = normalizedValue.match(/=+$/)?.[0].length || 0;
  return Math.floor((normalizedValue.length * 3) / 4) - paddingLength;
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

function getEncryptedVoiceNoteAudioBase64(voiceNote) {
  return normalizeBase64(voiceNote?.encryptedAudioBase64);
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

function normalizeSize(voiceNote, audioBuffer, encryptedAudioSizeBytes = 0) {
  const declaredSize = Number.isFinite(voiceNote?.size) ? Math.max(0, Number(voiceNote.size)) : 0;
  const declaredSizeBytes = Number.isFinite(voiceNote?.sizeBytes)
    ? Math.max(0, Number(voiceNote.sizeBytes))
    : 0;

  return Math.max(declaredSize, declaredSizeBytes, audioBuffer?.length || 0, encryptedAudioSizeBytes);
}

function makeVoiceNoteAudioError(field) {
  return new AppError("Voice note audio is invalid.", {
    statusCode: 400,
    code: "VOICE_NOTE_AUDIO_INVALID",
    field
  });
}

function makeVoiceNoteTooLargeError(field) {
  return new AppError(
    "Voice notes must stay under 1 MB when sent securely. Try a slightly shorter recording.",
    {
      statusCode: 400,
      code: "VOICE_NOTE_AUDIO_TOO_LARGE",
      field
    }
  );
}

function assertVoiceNoteSizeWithinLimit(sizeBytes, field) {
  if (sizeBytes > MAX_VOICE_NOTE_AUDIO_BYTES) {
    throw makeVoiceNoteTooLargeError(field);
  }
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

    assertVoiceNoteSizeWithinLimit(audioBuffer.length, field);

    return audioBuffer;
  } catch (error) {
    if (error?.code === "VOICE_NOTE_AUDIO_TOO_LARGE") {
      throw error;
    }

    throw makeVoiceNoteAudioError(field);
  }
}

function validateEncryptedVoiceNoteAudio(base64Audio, field) {
  const payloadSizeBytes = getBase64PayloadSizeBytes(base64Audio);

  if (!payloadSizeBytes) {
    return 0;
  }

  decodeVoiceNoteAudio(base64Audio, field);
  return payloadSizeBytes;
}

export function hasVoiceNoteContent(voiceNote) {
  const remoteUrl = trimString(voiceNote?.url);

  return Boolean(
    getVoiceNoteAudioBase64(voiceNote) ||
      getEncryptedVoiceNoteAudioBase64(voiceNote) ||
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
  const encryptedAudioBase64 = getEncryptedVoiceNoteAudioBase64(voiceNote);
  const audioBuffer = audioBase64
    ? decodeVoiceNoteAudio(audioBase64, field)
    : getVoiceNoteAudioBuffer(voiceNote);
  const encryptedAudioSizeBytes = encryptedAudioBase64
    ? validateEncryptedVoiceNoteAudio(encryptedAudioBase64, field)
    : 0;
  const durationMs = normalizeDurationMs(voiceNote, maxDurationMs);
  const size = normalizeSize(voiceNote, audioBuffer, encryptedAudioSizeBytes);

  assertVoiceNoteSizeWithinLimit(audioBuffer?.length || 0, field);
  assertVoiceNoteSizeWithinLimit(size, field);

  return {
    audioData: audioBuffer?.length ? audioBuffer : undefined,
    encryptedAudioBase64,
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
  const encryptedAudioBase64 = getEncryptedVoiceNoteAudioBase64(voiceNote);
  const durationMs = normalizeDurationMs(voiceNote, maxDurationMs);
  const size = normalizeSize(voiceNote, audioBuffer);

  return {
    audioBase64,
    encryptedAudioBase64,
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
