const https  = require("https");
const logger = require("../utils/logger");

// ── Token cache ────────────────────────────────────────────────────
let _cachedToken    = null;
let _tokenExpiresAt = 0;

// ── Get Zoom OAuth Token (Server-to-Server) ────────────────────────
const getZoomToken = async () => {
  if (_cachedToken && Date.now() < _tokenExpiresAt - 60000) {
    return _cachedToken;
  }

  const accountId    = process.env.ZOOM_ACCOUNT_ID;
  const clientId     = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error("Zoom credentials not configured.");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const postData    = `grant_type=account_credentials&account_id=${accountId}`;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "zoom.us",
      path:     "/oauth/token",
      method:   "POST",
      headers:  {
        Authorization:    `Basic ${credentials}`,
        "Content-Type":   "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => (data += c));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.access_token) {
            _cachedToken    = parsed.access_token;
            _tokenExpiresAt = Date.now() + (parsed.expires_in || 3600) * 1000;
            logger.info("✅ Zoom token obtained successfully");
            resolve(_cachedToken);
          } else {
            const msg = parsed.reason || parsed.error_description || parsed.error || "Failed to get Zoom token";
            logger.error(`Zoom token error: ${msg} | Response: ${data}`);
            reject(new Error(msg));
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
      res.on("data", c => (data += c));
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
            const msg = parsed.message || parsed.error || `Zoom API error ${res.statusCode}`;
            logger.error(`Zoom API ${method} ${path} → ${res.statusCode}: ${msg}`);
            reject(new Error(msg));
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

// ── Get account's first user (me) ─────────────────────────────────
// Server-to-Server OAuth creates meetings under the account owner
const getAccountUserId = async () => {
  try {
    const res = await zoomRequest("GET", "/users/me");
    return res.id || "me";
  } catch {
    return "me"; // fallback
  }
};

// ── Create Meeting ─────────────────────────────────────────────────
exports.createMeeting = async ({ topic, agenda, startTime, duration }) => {
  try {
    // Use "me" — Server-to-Server OAuth always creates under the account owner
    const userId = await getAccountUserId();

    const meeting = await zoomRequest("POST", `/users/${userId}/meetings`, {
      topic,
      agenda:      agenda || topic,
      type:        2, // scheduled meeting
      start_time:  new Date(startTime).toISOString(),
      duration:    duration || 60,
      timezone:    "Asia/Kolkata",      settings: {
        host_video:        true,
        participant_video: true,
        join_before_host:  true,   // allow joining before host
        waiting_room:      false,  // no waiting room — direct join
        auto_recording:    "none",
        mute_upon_entry:   false,
        approval_type:     0,      // automatically approve
      },
    });

    logger.info(`✅ Zoom meeting created: ${meeting.id} — ${topic}`);

    return {
      meetingId: String(meeting.id),
      joinUrl:   meeting.join_url,
      startUrl:  meeting.start_url,
      password:  meeting.password || "",
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

// ── Check if Zoom is configured ────────────────────────────────────
exports.isConfigured = () => {
  return !!(
    process.env.ZOOM_ACCOUNT_ID &&
    process.env.ZOOM_CLIENT_ID  &&
    process.env.ZOOM_CLIENT_SECRET &&
    process.env.ZOOM_ACCOUNT_ID    !== "your_zoom_account_id" &&
    process.env.ZOOM_CLIENT_ID     !== "your_zoom_client_id"
  );
};

// ── Test connection ────────────────────────────────────────────────
exports.testConnection = async () => {
  const token = await getZoomToken();
  const user  = await zoomRequest("GET", "/users/me");
  return { token: token.slice(0, 20) + "...", userId: user.id, email: user.email };
};
