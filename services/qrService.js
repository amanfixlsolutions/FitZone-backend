const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");

// ─────────────────────────────────────────────────────────────────
// generateMemberQR
//
// Generates a personal QR code for a member.
// QR encodes a URL: /checkin?qrData=<json>&name=<gymName>
// Member scans → browser opens /checkin → attendance auto-marked
// ─────────────────────────────────────────────────────────────────
exports.generateMemberQR = async (memberId, gymName = "") => {
  const qrId = uuidv4();

  const FRONTEND_URL =
    process.env.FRONTEND_URL ||
    process.env.CLIENT_URL   ||
    "https://gym-fit-zone.vercel.app";

  const payload = JSON.stringify({
    memberId,
    qrId,
    type: "member-checkin",
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
