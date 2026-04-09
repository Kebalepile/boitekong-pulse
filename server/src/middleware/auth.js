import { User } from "../models/User.js";
import { AppError } from "../utils/appError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { verifyAccessToken } from "../utils/token.js";

export const requireAuth = asyncHandler(async (req, res, next) => {
  const authorization = req.headers.authorization || "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new AppError("Authentication required.", {
      statusCode: 401,
      code: "AUTH_REQUIRED"
    });
  }

  let payload;

  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new AppError("Invalid or expired token.", {
      statusCode: 401,
      code: "AUTH_TOKEN_INVALID"
    });
  }

  const user = await User.findById(payload.sub);

  if (!user) {
    throw new AppError("Authentication required.", {
      statusCode: 401,
      code: "AUTH_REQUIRED"
    });
  }

  req.user = user;
  req.auth = payload;
  next();
});
