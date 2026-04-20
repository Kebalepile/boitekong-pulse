# Boitekong Pulse API

Boitekong Pulse now runs as a hybrid app: the frontend keeps lightweight browser caches, but the main app flows are already API-backed.

## Current scope

- Express + MongoDB/Mongoose API
- JWT auth
- SMS OTP flow
- User profile/settings/search/follow/block endpoints
- Posts, comments, and reactions endpoints
- Conversations, direct messages, and read-state endpoints
- Notifications endpoints
- Reports endpoints
- Realtime websocket sync at `/api/realtime`

## Routes included now

### Health

- `GET /api/health`

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/password-reset/request`
- `POST /api/auth/password-reset/confirm`
- `GET /api/auth/me`
- `POST /api/auth/otp/send`
- `POST /api/auth/otp/verify`

### Users

- `PATCH /api/users/me/profile`
- `PUT /api/users/me/direct-message-key`
- `PATCH /api/users/me/settings/direct-messages`
- `PATCH /api/users/me/settings/notifications`
- `GET /api/users/search`
- `GET /api/users/:userId`
- `GET /api/users/:userId/followers`
- `GET /api/users/:userId/following`
- `GET /api/users/:userId/dm-availability`
- `POST /api/users/:userId/follow`
- `DELETE /api/users/:userId/follow`
- `POST /api/users/:userId/block`
- `DELETE /api/users/:userId/block`

### Posts and comments

- `POST /api/posts`
- `GET /api/posts/feed`
- `GET /api/posts/search`
- `GET /api/posts/user/:userId`
- `GET /api/posts/:postId`
- `PATCH /api/posts/:postId`
- `DELETE /api/posts/:postId`
- `POST /api/posts/:postId/reactions`
- `GET /api/posts/:postId/comments`
- `POST /api/posts/:postId/comments`
- `PATCH /api/posts/:postId/comments/:commentId`
- `DELETE /api/posts/:postId/comments/:commentId`
- `POST /api/posts/:postId/comments/:commentId/reactions`

### Conversations and messages

- `GET /api/conversations`
- `POST /api/conversations/archive`
- `POST /api/conversations/archive-all`
- `POST /api/conversations/direct/:userId`
- `GET /api/conversations/:conversationId`
- `POST /api/conversations/:conversationId/read`
- `POST /api/conversations/:conversationId/messages`
- `PATCH /api/conversations/:conversationId/messages/:messageId`
- `DELETE /api/conversations/:conversationId/messages/:messageId`

### Notifications

- `GET /api/notifications`
- `PATCH /api/notifications/read-all`
- `PATCH /api/notifications/conversations/:conversationId/read`
- `PATCH /api/notifications/:notificationId/read`

### Reports

- `GET /api/reports`
- `POST /api/reports`

## Realtime

- Websocket endpoint: `/api/realtime`
- Auth: pass a valid access token in the query string as `access_token`
- Used for notifying clients that conversations, notifications, or posts changed

## Setup

1. Install dependencies:
   - `npm install`
2. Copy `.env.example` to `.env` and fill in the values you need
3. Configure MongoDB:
   - Local Mongo: set `MONGODB_URI`
   - MongoDB Atlas: set `MONGODB_CLUSTER_HOST`, `MONGODB_DATABASE_NAME`, `MONGODB_USERNAME`, and `MONGODB_PASSWORD`
   - Optional partitioned layout: also set `MONGODB_URI_TWO`, `MONGODB_URI_THREE`, and `MONGODB_URI_FOUR`
4. Configure auth and app runtime:
   - `JWT_SECRET`
   - Optional: `JWT_EXPIRES_IN`
   - Optional: `PORT`
   - `CORS_ORIGIN` for production, for example `https://yourapp.vercel.app`
   - Optional aliases: `FRONTEND_ORIGIN`, `APP_ORIGIN`
   - `TRUST_PROXY=1` when the API is behind a platform proxy such as Render
5. Configure SMS/OTP if you want real phone verification:
   - `SMS_APIKEY`
   - Optional: `SMS_BASE_URL`
   - Optional: `OTP_CODE_LENGTH`
   - Optional: `OTP_EXPIRES_IN_MINUTES`
   - Optional: `OTP_RESEND_COOLDOWN_SECONDS`
   - Optional: `OTP_MAX_ATTEMPTS`
6. Optional migration/runtime settings:
   - `API_BODY_LIMIT`
   - `VOICE_NOTES_PER_DAY_LIMIT`
   - `VOICE_NOTE_DAILY_LIMIT_TIMEZONE`
   - `MONGODB_DNS_SERVERS`
   - `SERVER_REQUEST_TIMEOUT_MS`
   - `SERVER_HEADERS_TIMEOUT_MS`
   - `SERVER_KEEP_ALIVE_TIMEOUT_MS`

## Frontend runtime config

- The static frontend now reads `runtime-config.js` before the app boots.
- For split-domain deploys such as `yourapp.vercel.app` -> `your-api.onrender.com`, set `window.BOITEKONG_PULSE_CONFIG.API_BASE_URL` to `https://your-api.onrender.com/api`.
- Leave `API_BASE_URL` blank only for localhost or private-network development.
- If the frontend is deployed without an API base URL on a non-local hostname, the app now stops early with a clear configuration error instead of silently guessing the wrong origin.

## Scripts

- `npm run dev:api` - run the API in watch mode
- `npm run start:api` - run the API normally
- `npm run check:api` - syntax-check the API entrypoint
- `npm run db:init` - initialize collections/indexes
- `npm run check:db` - smoke-test Mongo connectivity
- `npm run db:migrate-partitions` - copy posts/comments/notifications and conversations/messages into the optional secondary Mongo targets
- `npm run db:cleanup-partitions` - re-sync, verify, and drop the old migrated collections from the core Mongo store
- `npm run cleanup:legacy-voice-notes` - purge older inline `data:` voice notes

## Optional Multi-DB Partitioning

- Default mode is `MONGODB_PARTITION_MODE=single`, which keeps every model on `MONGODB_URI`.
- `core` data stays on `MONGODB_URI`: users, OTP verifications, and reports.
- `content` data can be moved to `MONGODB_URI_TWO`: posts and comments.
- `messaging` data can be moved to `MONGODB_URI_THREE`: conversations and messages.
- `notifications` data can be moved to `MONGODB_URI_FOUR`: notifications.
- Safe rollout order:
  1. Set `MONGODB_URI_TWO`, `MONGODB_URI_THREE`, and optionally `MONGODB_URI_FOUR`, but keep `MONGODB_PARTITION_MODE=single`.
  2. Run `npm run db:migrate-partitions`.
  3. Verify the copied data from the extra clusters.
  4. Switch `MONGODB_PARTITION_MODE=partitioned` and restart the API.
- If `MONGODB_URI_FOUR` is left blank, notifications stay grouped with the content store.
- The migration script is copy-first: it upserts into the secondary targets and leaves the original collections untouched until you choose to clean them up later.
- After the split has been verified, `npm run db:cleanup-partitions` re-syncs the source docs one last time, verifies their `_id`s exist in the target stores, and only then drops the old source collections from the core database.

## Important notes

- The API now refuses to start in `production` if `JWT_SECRET` is still the placeholder default.
- The API also refuses to start in `production` if `CORS_ORIGIN` is blank, wildcarded, or not a valid `http(s)` origin list.
- The API now adds security headers and `no-store` cache headers to `/api` responses.
- Auth, signup, password-reset, and OTP endpoints now have in-memory rate limits to reduce brute-force and abuse pressure.
- Realtime websocket upgrades now enforce valid websocket handshakes, allowed frontend origins, and per-IP handshake throttling.
- The frontend still keeps browser caches for hydration/fallback, but the primary app flows are API-backed now.
- Forgot-password reset uses SMS OTP, requires a phone number that already exists in the database, expires after 5 minutes, and can only be completed once every 24 hours.
- Avatars still tolerate data URLs in the current migration phase.
- Voice notes currently use the migration-friendly binary/base64 path and are persisted in Mongo instead of full inline `data:` URLs.
- Voice-note creation can be capped per user per day with `VOICE_NOTES_PER_DAY_LIMIT`.
- Browser notifications exist on the frontend, but this repo does not yet implement a full web-push backend.
- Dedicated object storage/media hosting is still a later phase.

## Before beta go-live

This API is close to a controlled beta backend, but do not treat "routes exist" as "production ready."

Before a real beta deployment, confirm:

- end-to-end browser QA passes against the real API
- SMS OTP works on a real phone/provider path
- `JWT_SECRET` is production-safe
- `runtime-config.js` points the frontend to the real API base URL
- `CORS_ORIGIN` is locked to the real frontend origin
- `TRUST_PROXY` is set correctly for the deployment platform
- MongoDB Atlas or the production Mongo deployment is reachable from the deployed environment
- monitoring/logging is in place
- backup/restore expectations are defined
- auth/OTP abuse controls are covered before public exposure

## Next likely work

- full QA pass
- real SMS OTP verification
- deployment hardening
- dedicated media storage later
- moderator tooling later
