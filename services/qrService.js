const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");

exports.generateMemberQR = async (memberId) => {
  const qrId = uuidv4();
  const data = JSON.stringify({ memberId, qrId, type: "member-checkin" });
  const qrCode = await QRCode.toDataURL(data, { width: 300, margin: 2 });
  return { qrId, qrCode };
};

exports.parseQRData = (qrString) => {
  try {
    return JSON.parse(qrString);
  } catch {
    return null;
  }
};
