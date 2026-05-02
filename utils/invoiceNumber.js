const Invoice = require("../models/Invoice");

exports.generateInvoiceNumber = async () => {
  const year  = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const count = await Invoice.countDocuments();
  const seq   = String(count + 1).padStart(5, "0");
  return `INV-${year}${month}-${seq}`;
};
