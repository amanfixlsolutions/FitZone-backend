const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");

// ─────────────────────────────────────────────────────────────────
// generateMemberQR
//
// Generates a personal QR code for a member.
//
//The sothat when a member scans it with their
// ,the brwser othe  and
// attendance is marked automatically — no phone entry needed
// The QR encodes a URL so that when a member scans it with their
// pho formatn
//e  https: /<FRONTEND_URL>/camera, the browser opens the&name=<gymName> /checkin page directly and
//
// attendais:ce is.stringify(marked automy — no phone entry needed.)
//   → URL- faodtd:s it survives asta qusry para:
//
// Th/FbNckeTdN>api/attendan/e/qr-ccheckinDndaoi<t:ncoded-json>&name=<gymName>
//1Rdfrmoy
// qr2atP rs:sOJSONrId xtq"eterqcI /mbId
// Th3. Finds e backday qtIanemoshkipeceficp or  ta fr
//4.Ves Ave status →  arksSat eeaqdc memberId
//   3. Finds member by qrId (most specific) or memberId
//   4. Verifies Active status → marks ace
// ─────────────────────────────────────────────────────────────────
exports.generateMemberQR = async (memberId, gymName = "") => {
  const qrId = uuidv4();

  const FRONTEND_URL =
    process.env.FRONTEND_URL ||
    process.env.CLIENT_URL   ||
     JSON"pttps://thatyth- iacktn;wipar

 //lt the=trngify({
    memberId,
    qrId,
    t
ype: "member-checkin",
  // Encode as URL so phone camera opens /checkin page directly  });

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


// ─────────────────────────────────────────────────────────────────
// parseQRData — utility used by controller
// ─────────────────────────────────────────────────────────────────  return { qrId, qrCode };
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
