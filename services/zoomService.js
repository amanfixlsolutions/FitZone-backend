const https = require("https");
const logger = require("../utils/logger");

// ── Get Zoom OAuth Token (Server-to-Server) ────────────────────────
const getZoomToken = async () => {
  const credentials = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString("base64");

  return new Promise((resolve, reject) => {
    const postData = `grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`;

    const options = {
      hostname: "zoom.us",
      path: "/oauth/token",
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
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
          if (parsed.access_token) resolve(parsed.access_token);
          else reject(new Error(parsed.reason || "Failed to get Zoom token"));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    req.write(postData);
    req.end();
  });
};

// ── Zoom API Request Helper ────────────────────────────────────────
const zoomRequest = async (method, path, body = null) => {
  const token = await getZoomToken();

  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;

    const options = {
      hostname: "api.zoom.us",
      path: `/v2${path}`,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(postData && { "Content-Length": Buffer.byteLength(postData) }),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          reject(e);
        }
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
      agenda,
      type: 2, // Scheduled meeting
      start_time: new Date(startTime).toISOString(),
      duration,
      timezone: "Asia/Kolkata",
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: false,
        waiting_room: true,
        auto_recording: "none",
      },
    });

    return {
      meetingId:  String(meeting.id),
      joinUrl:    meeting.join_url,
      startUrl:   meeting.start_url,
      password:   meeting.password,
      hostEmail,
    };
  } catch (err) {
    logger.error(`Zoom createMeeting error: ${err.message}`);
    throw new Error("Failed to create Zoom meeting. Check Zoom credentials.");
  }
};

// ── Get Meeting ────────────────────────────────────────────────────
exports.getMeeting = async (meetingId) => {
  return zoomRequest("GET", `/meetings/${meetingId}`);
};

// ── Delete Meeting ─────────────────────────────────────────────────
exports.deleteMeeting = async (meetingId) => {
  return zoomRequest("DELETE", `/meetings/${meetingId}`);
};

// ── List Meetings ──────────────────────────────────────────────────
exports.listMeetings = async (hostEmail) => {
  return zoomRequest("GET", `/users/${hostEmail}/meetings?type=scheduled`);
};
