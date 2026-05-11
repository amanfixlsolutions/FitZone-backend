const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");

// ─────────────────────────────────────────────────────────────────
// generateMemberQR
//
// Generates a personal QR code for a member.
// QR encodes a URL → phone camera opens /checkin page directly.
//
// URL: /checkin?qrData=<encoded-json>
// qrData = JSON { memberId, gymId, qrId, type: "member-checkin" }
//
// Attendance flow:
//   1. Member scans QR → /checkin page opens
//   2. Page auto-submits qrData to backend
//   3. Backend: find member by qrId → verify gymId matches → mark attendance
//
// Parameters:
//   memberId  — Member._id  (ObjectId string)
//   gymId     — Member.gym  (ObjectId string) — stored in QR for verification
//   gymName   — optional display name
// ─────────────────────────────────────────────────────────────────
exports.generateMemberQR = async (memberId, gymId = "", gymName = "") => {
  const qrId = uuidv4();

  const FRONTEND_URL =
    process.env.FRONTEND_URL ||
    process.env.CLIENT_URL   ||
    "https://gym-fit-zone.vercel.app";

  // Payload — memberId + gymId + qrId all stored in QR
  const payload = JSON.stringify({
    memberId: String(memberId),
    gymId:    String(gymId),
    qrId,
    type:     "member-checkin",
  });

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

exports.parseQRData = (qrString) => {
  try { return JSON.parse(qrString); } catch { return null; }
};
