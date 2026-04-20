const existingBoitekongPulseConfig =
  typeof window.BOITEKONG_PULSE_CONFIG === "object" && window.BOITEKONG_PULSE_CONFIG !== null
    ? window.BOITEKONG_PULSE_CONFIG
    : {};

window.BOITEKONG_PULSE_CONFIG = {
  ...existingBoitekongPulseConfig,
  // Leave this blank for localhost or private-network development.
  // For split-domain deploys, set the full API base URL.
  // Example: "https://your-api.onrender.com/api"
  API_BASE_URL:
    typeof existingBoitekongPulseConfig.API_BASE_URL === "string"
      ? existingBoitekongPulseConfig.API_BASE_URL
      : ""
};
