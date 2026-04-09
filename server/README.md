# Boitekong Pulse API

Phase 7 starts here. This backend scaffold is designed to let the current frontend migrate away from `localStorage` service-by-service instead of forcing a full UI rewrite.

## Included now

- Express app bootstrap
- Environment loading
- MongoDB connection
- Health endpoint
- JWT auth
- User model
- Clickatell SMS service using native `fetch`
- Auth endpoints:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `GET /api/auth/me`
  - `POST /api/auth/otp/send`
  - `POST /api/auth/otp/verify`
- User endpoints:
  - `PATCH /api/users/me/profile`
  - `PATCH /api/users/me/settings/direct-messages`
  - `PATCH /api/users/me/settings/notifications`
  - `GET /api/users/:userId/dm-availability`
  - `POST /api/users/:userId/follow`
  - `DELETE /api/users/:userId/follow`
  - `POST /api/users/:userId/block`
  - `DELETE /api/users/:userId/block`

## Setup

1. Install dependencies:
   - `npm install`
2. Configure `.env` directly.
3. Configure MongoDB:
   - Local Mongo: set `MONGODB_URI`
   - MongoDB Atlas: set `MONGODB_CLUSTER_HOST`, `MONGODB_DATABASE_NAME`, `MONGODB_USERNAME`, and `MONGODB_PASSWORD`
4. Configure SMS/OTP if you want phone verification:
   - Set `SMS_APIKEY`
   - Optional: `SMS_BASE_URL`, `OTP_CODE_LENGTH`, `OTP_EXPIRES_IN_MINUTES`, `OTP_RESEND_COOLDOWN_SECONDS`, `OTP_MAX_ATTEMPTS`
5. Run the API:
   - `npm run dev:api`
6. Initialize collections and indexes explicitly when needed:
   - `npm run db:init`

## Notes

- This scaffold intentionally keeps media upload out of Phase 7 for now. Profile updates expect an `avatarUrl`, not raw image data.
- The next backend slices should be posts/comments, messages, notifications, and reports.
- MongoDB uses one application database with multiple collections. In this project the main collections are `users`, `posts`, `comments`, `conversations`, `messages`, `notifications`, `reports`, and `otpverifications`.
- The SMS integration uses native `fetch` on the server and does not add Axios or any extra HTTP client library.
