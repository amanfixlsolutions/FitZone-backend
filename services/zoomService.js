const https  = require("https");
const logger = require("../utils/logger");

// ── Token cache ────────────────────────────────────────────────────
let _cachedToken    = null;
let _tokenExpiresAt = 0;

// ── Get Zoom OAuth Token (Server-to-Server) with caching ──────────
const getZoomToken = async () => {
  if (_cachedToken && Date.now() < _tokenExpiresAt - 60000) {
    return _cachedToken;
  }

  if (!process.env.ZOOM_CLIENT_ID || !process.env.ZOOM_CLIENT_SECRET || !process.env.ZOOM_ACCOUNT_ID) {
    throw new Error("Zoom credentials not configured. Set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET in .env");
  }

  const credentials = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString("base64");

  return new Promise((resolve, reject) => {
    const postData = `grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`;
    const options  = {
      hostname: "zoom.us",
      path:     "/oauth/token",
      method:   "POST",
      headers:  {
        Authorization:  `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.access_token) {
            _cachedToken    = parsed.access_token;
            _tokenExpiresAt = Date.now() + (parsed.expires_in || 3600) * 1000;
            resolve(_cachedToken);
          } else {
            reject(new Error(parsed.reason || parsed.error || "Failed to get Zoom token"));
          }
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
};

// ── Zoom API Request Helper ────────────────────────────────────────
const zoomRequest = async (method, path, body = null, retry = true) => {
  const token    = await getZoomToken();
  const postData = body ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.zoom.us",
      path:     `/v2${path}`,
      method,
      headers:  {
        Authorization:  `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(postData && { "Content-Length": Buffer.byteLength(postData) }),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", async () => {
        try {
          const parsed = data ? JSON.parse(data) : {};

          // Token expired — clear cache and retry once
          if (res.statusCode === 401 && retry) {
            _cachedToken = null; _tokenExpiresAt = 0;
            try { resolve(await zoomRequest(method, path, body, false)); }
            catch (e) { reject(e); }
            return;
          }

          if (res.statusCode >= 400) {
            reject(new Error(parsed.message || `Zoom API error ${res.statusCode}`));
            return;
          }
          resolve(parsed);
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    if (postData) req.write(postData);
    req.end();
  });
};

// ── Create Meeting ─────────────────────────────────────────────────
exports.createMeeting = async ({ topic, agenda, startTime, duration, hostEmail }) => {
  try {
    const meeting = await zoomRequest("POST", `/users/${hostEmail}/meetings`, {
      topic,
      agenda:      agenda || topic,
      type:        2,
      start_time:  new Date(startTime).toISOString(),
      duration,
      timezone:    "Asia/Kolkata",
      settings: {
        host_video:        true,
        participant_video: true,
        join_before_host:  false,
        waiting_room:      true,
        auto_recording:    "none",
        mute_upon_entry:   false,
      },
    });
    return {
      meetingId: String(meeting.id),
      joinUrl:   meeting.join_url,
      startUrl:  meeting.start_url,
      password:  meeting.password || "",
      hostEmail,
    };
  } catch (err) {
    logger.error(`Zoom createMeeting error: ${err.message}`);
    throw new Error(`Failed to create Zoom meeting: ${err.message}`);
  }
};

// ── Get Meeting ────────────────────────────────────────────────────
exports.getMeeting = async (meetingId) => {
  return zoomRequest("GET", `/meetings/${meetingId}`);
};

// ── Delete Meeting ─────────────────────────────────────────────────
exports.deleteMeeting = async (meetingId) => {
  try {
    return await zoomRequest("DELETE", `/meetings/${meetingId}`);
  } catch (err) {
    logger.warn(`Zoom deleteMeeting warning: ${err.message}`);
    return {};
  }
};

// ── List Meetings ──────────────────────────────────────────────────
exports.listMeetings = async (hostEmail) => {
  return zoomRequest("GET", `/users/${hostEmail}/meetings?type=scheduled`);
};

// ── Check if Zoom is configured ────────────────────────────────────
exports.isConfigured = () => {
  return !!(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
};
