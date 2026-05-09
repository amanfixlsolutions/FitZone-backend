const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");

// ─────────────────────────────────────────────────────────────────
// generateMemberQR
//
// Generates a personal QR code for a member.
//
// The QR encodes a URL so that when a member scans it with their
// phone camera, the browser opens the /checkin page directly and
// attendance is marked automatically — no phone entry needed.
//
// URL format:
//   https://<FRONTEND_URL>/checkin?qrData=<encoded-json>&name=<gymName>
//
// qrData is: JSON.stringify({ memberId, qrId, type: "member-checkin" })
//   → URL-encoded so it survives as a query param
//
// The backend /api/attendance/qr-checkin endpoint:
//   1. Reads qrData from body
//   2. Parses JSON → extracts qrId / memberId
//   3. Finds member by qrId (most specific) or memberId
//   4. Verifies Active status → marks attendance
// ─────────────────────────────────────────────────────────────────
exports.generateMemberQR = async (memberId, gymName = "") => {
  const qrId = uuidv4();

  const FRONTEND_URL =
    process.env.FRONTEND_URL ||
    process.env.CLIENT_URL   ||
    "https://gym-fit-zone.vercel.app";

  // JSON payload that the backend will parse
  const payload = JSON.stringify({
    memberId,
    qrId,
    type: "member-checkin",
  });

  // Encode as URL so phone camera opens /checkin page directly
  const checkinUrl =
    `${FRONTEND_URL}/checkin` +
    `?qrData=${encodeURIComponent(payload)}` +
    (gymName ? `&name=${encodeURIComponent(gymName)}` : "");

  const qrCode = await QRCode.toDataURL(checkinUrl, {
    width:                300,
    margin:               2,
    errorCorrectionLevel: "M",
  });

  return { qrId, qrCode };
};

// ─────────────────────────────────────────────────────────────────
// parseQRData — utility used by controller
// ─────────────────────────────────────────────────────────────────
exports.parseQRData = (qrString) => {
  try {
    return JSON.parse(qrString);
  } catch {
    return null;
  }
};
