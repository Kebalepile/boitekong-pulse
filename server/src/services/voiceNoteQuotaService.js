import { env } from "../config/env.js";
import { Comment } from "../models/Comment.js";
import { Message } from "../models/Message.js";
import { Post } from "../models/Post.js";
import { AppError } from "../utils/appError.js";

const dateFormatterCache = new Map();
const VOICE_NOTE_PRESENT_FILTER = {
  $or: [
    { "voiceNote.audioData": { $exists: true, $ne: null } },
    { "voiceNote.encryptedAudioBase64": { $exists: true, $ne: "" } },
    { "voiceNote.url": { $exists: true, $ne: "" } },
    { "voiceNote.storageKey": { $exists: true, $ne: "" } }
  ]
};

function getDateFormatter(timeZone) {
  if (!dateFormatterCache.has(timeZone)) {
    dateFormatterCache.set(
      timeZone,
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
      })
    );
  }

  return dateFormatterCache.get(timeZone);
}

function getZonedDateParts(date, timeZone) {
  const parts = getDateFormatter(timeZone).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number.parseInt(values.year, 10),
    month: Number.parseInt(values.month, 10),
    day: Number.parseInt(values.day, 10),
    hour: Number.parseInt(values.hour, 10),
    minute: Number.parseInt(values.minute, 10),
    second: Number.parseInt(values.second, 10)
  };
}

function getOffsetMs(date, timeZone) {
  const zonedParts = getZonedDateParts(date, timeZone);
  const zonedAsUtc = Date.UTC(
    zonedParts.year,
    zonedParts.month - 1,
    zonedParts.day,
    zonedParts.hour,
    zonedParts.minute,
    zonedParts.second
  );

  return zonedAsUtc - date.getTime();
}

function getUtcDateForZonedDateTime({
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0
}, timeZone) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const initialOffsetMs = getOffsetMs(utcGuess, timeZone);
  let resolvedDate = new Date(utcGuess.getTime() - initialOffsetMs);
  const resolvedOffsetMs = getOffsetMs(resolvedDate, timeZone);

  if (resolvedOffsetMs !== initialOffsetMs) {
    resolvedDate = new Date(utcGuess.getTime() - resolvedOffsetMs);
  }

  return resolvedDate;
}

function getNextDayParts({ year, month, day }) {
  const nextDayDate = new Date(Date.UTC(year, month - 1, day + 1));

  return {
    year: nextDayDate.getUTCFullYear(),
    month: nextDayDate.getUTCMonth() + 1,
    day: nextDayDate.getUTCDate()
  };
}

function formatDayLabel({ year, month, day }) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getDailyVoiceNoteWindow(now = new Date()) {
  const timeZone = env.voiceNoteDailyLimitTimezone;
  const dayParts = getZonedDateParts(now, timeZone);
  const nextDayParts = getNextDayParts(dayParts);

  return {
    timeZone,
    dayLabel: formatDayLabel(dayParts),
    startAt: getUtcDateForZonedDateTime(
      {
        year: dayParts.year,
        month: dayParts.month,
        day: dayParts.day,
        hour: 0,
        minute: 0,
        second: 0
      },
      timeZone
    ),
    resetsAt: getUtcDateForZonedDateTime(
      {
        year: nextDayParts.year,
        month: nextDayParts.month,
        day: nextDayParts.day,
        hour: 0,
        minute: 0,
        second: 0
      },
      timeZone
    )
  };
}

export async function assertVoiceNoteCreationAllowed(currentUserId) {
  if (env.voiceNotesPerDayLimit <= 0) {
    return;
  }

  const { startAt, resetsAt, dayLabel, timeZone } = getDailyVoiceNoteWindow();
  const createdAtFilter = {
    $gte: startAt,
    $lt: resetsAt
  };

  const [postCount, commentCount, messageCount] = await Promise.all([
    Post.countDocuments({
      userId: currentUserId,
      createdAt: createdAtFilter,
      ...VOICE_NOTE_PRESENT_FILTER
    }),
    Comment.countDocuments({
      userId: currentUserId,
      createdAt: createdAtFilter,
      ...VOICE_NOTE_PRESENT_FILTER
    }),
    Message.countDocuments({
      senderId: currentUserId,
      createdAt: createdAtFilter,
      ...VOICE_NOTE_PRESENT_FILTER
    })
  ]);

  const used = Number(postCount || 0) + Number(commentCount || 0) + Number(messageCount || 0);

  if (used < env.voiceNotesPerDayLimit) {
    return;
  }

  throw new AppError(
    `Voice note usage is currently limited. You have used up your daily ${env.voiceNotesPerDayLimit} voice notes. Try again tomorrow.`,
    {
      statusCode: 429,
      code: "VOICE_NOTE_DAILY_LIMIT_REACHED",
      details: {
        limit: env.voiceNotesPerDayLimit,
        used,
        remaining: 0,
        day: dayLabel,
        timeZone,
        resetsAt
      }
    }
  );
}
