const Invoice = require("../models/Invoice");
const { asyncHandler } = require("../utils/asyncHandler");
const { paginate, buildPaginationMeta } = require("../utils/pagination");
const AppError = require("../utils/AppError");
const { sendEmail } = require("../services/emailService");

// ── @GET /api/invoices ─────────────────────────────────────────────
exports.getInvoices = asyncHandler(async (req, res) => {
  const { status, memberId, gymId } = req.query;
  const filter = {};

  if (req.user.role === "gym-owner") filter.gym = req.user.gym;
  else if (gymId) filter.gym = gymId;

  if (status)   filter.status = status;
  if (memberId) filter.member = memberId;

  const total = await Invoice.countDocuments(filter);
  const { query, pagination } = paginate(
    Invoice.find(filter).populate("member", "name email").sort({ createdAt: -1 }),
    req.query
  );

  const invoices = await query;
  res.json({
    success: true,
    data: invoices,
    pagination: buildPaginationMeta(total, pagination.page, pagination.limit),
  });
});

// ── @GET /api/invoices/:id ─────────────────────────────────────────
exports.getInvoice = asyncHandler(async (req, res, next) => {
  const invoice = await Invoice.findById(req.params.id).populate("member plan gym");
  if (!invoice) return next(new AppError("Invoice not found.", 404));
  res.json({ success: true, data: invoice });
});

// ── @POST /api/invoices/:id/send ───────────────────────────────────
exports.sendInvoice = asyncHandler(async (req, res, next) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) return next(new AppError("Invoice not found.", 404));

  await sendEmail({
    to: invoice.memberEmail,
    subject: `Invoice ${invoice.invoiceNumber} - FitZone`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:30px">
        <h2>Invoice ${invoice.invoiceNumber}</h2>
        <p>Dear ${invoice.memberName},</p>
        <p>Please find your invoice details below:</p>
        <table style="width:100%;border-collapse:collapse">
          ${invoice.items.map(item => `
            <tr>
              <td style="padding:8px;border:1px solid #eee">${item.description}</td>
              <td style="padding:8px;border:1px solid #eee;text-align:right">₹${item.total}</td>
            </tr>
          `).join("")}
          <tr style="font-weight:bold">
            <td style="padding:8px;border:1px solid #eee">Total</td>
            <td style="padding:8px;border:1px solid #eee;text-align:right">₹${invoice.total}</td>
          </tr>
        </table>
        <p style="margin-top:20px">Status: <strong>${invoice.status}</strong></p>
      </div>
    `,
  });

  invoice.status = "Sent";
  await invoice.save();

  res.json({ success: true, message: "Invoice sent.", data: invoice });
});
