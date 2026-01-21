const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

/* ================== ANCHORS ================== */
const genSignAnchor = () =>
  `##SIGN_HERE_${Date.now()}_${Math.floor(Math.random() * 10000)}##`;

const DATE_ANCHOR = '##DATE_SIGNED##';

/* ================== HELPERS ================== */
const formatAmount = (val) =>
  `$${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(val || 0))}`;

/* ================== TABLE ================== */
async function drawAmountTable(page, width, height, total, permitFee, manufacturer) {
  const font = await page.doc.embedFont(StandardFonts.Helvetica);

  const margin = 40;
  const tableWidth = width - margin * 2;
  const rightX = margin + tableWidth;

  const startY = height - 60;
  const gap = 32;

  const row1Y = startY;
  const row2Y = startY - gap;

  const totalAmount = formatAmount(total);
  const netAmount = formatAmount(Number(total) - Number(permitFee));

  // Row 1
  page.drawText(
    'Permit Preparation & Engineering Services (Excludes City Permit Fees)',
    { x: margin, y: row1Y, size: 10, font }
  );

  page.drawText(totalAmount, {
    x: rightX - totalAmount.length * 6,
    y: row1Y,
    size: 10,
    font,
  });

  page.drawLine({
    start: { x: margin, y: row1Y - 12 },
    end: { x: rightX, y: row1Y - 12 },
    thickness: 0.7,
  });

  // Row 2
  page.drawText(manufacturer || 'Manufacturer', {
    x: margin,
    y: row2Y,
    size: 10,
    font,
  });

  page.drawText(netAmount, {
    x: rightX - netAmount.length * 6,
    y: row2Y,
    size: 10,
    font,
  });

  page.drawLine({
    start: { x: margin, y: row2Y - 12 },
    end: { x: rightX, y: row2Y - 12 },
    thickness: 0.7,
  });
}

/* ================== SIGNATURE ================== */
async function drawSignatureLayout(page, width, height, signAnchor, customerName) {
  const font = await page.doc.embedFont(StandardFonts.Helvetica);

  const margin = 40;
  const gap = 40;
  const colWidth = (width - margin * 2 - gap) / 2;

  const baseY = height - 220;

  const signAnchorY = baseY + 20;
  const nameY = baseY - 10;
  const nameLineY = nameY - 10;
  const dateAnchorY = nameLineY - 18;
  const dateLineY = dateAnchorY - 10;

  const leftX = margin;
  const rightX = margin + colWidth + gap;

  /* ---------- CUSTOMER ---------- */

  // Signature anchor (DocuSign)
  page.drawText(signAnchor, {
    x: leftX + 2,
    y: signAnchorY,
    size: 8,
    font,
    color: rgb(1, 1, 1),
  });

  // Customer name
  page.drawText(customerName || '', {
    x: leftX,
    y: nameY,
    size: 12,
    font,
  });

  page.drawLine({
    start: { x: leftX, y: nameLineY },
    end: { x: leftX + colWidth, y: nameLineY },
    thickness: 1,
  });

  // Date anchor (DocuSign date)
  page.drawText(DATE_ANCHOR, {
    x: leftX + 2,
    y: dateAnchorY,
    size: 8,
    font,
    color: rgb(1, 1, 1),
  });

  page.drawLine({
    start: { x: leftX, y: dateLineY },
    end: { x: leftX + colWidth, y: dateLineY },
    thickness: 1,
  });

  /* ---------- SALES OFFICE ---------- */

  page.drawText('Sales Office', {
    x: rightX,
    y: nameY,
    size: 12,
    font,
  });

  page.drawLine({
    start: { x: rightX, y: nameLineY },
    end: { x: rightX + colWidth, y: nameLineY },
    thickness: 1,
  });

  page.drawLine({
    start: { x: rightX, y: dateLineY },
    end: { x: rightX + colWidth, y: dateLineY },
    thickness: 1,
  });
}

/* ================== MAIN ================== */
async function insertAndAppendSignaturePages(
  originalPath,
  insertIndex1Based,
  customerName,
  total,
  permitFee,
  manufacturer
) {
  const bytes = fs.readFileSync(originalPath);
  const pdfDoc = await PDFDocument.load(bytes);

  const { width, height } = pdfDoc.getPages()[0].getSize();

  const signAnchor = genSignAnchor();

  // ✅ INDUSTRY LOGIC
  const shouldInsert =
    Number.isInteger(insertIndex1Based) && insertIndex1Based > 0;

  const insertIndex = shouldInsert ? insertIndex1Based - 1 : null;

  /* ---------- INSERT PAGE (ONLY IF VALID INDEX) ---------- */
  if (insertIndex !== null) {
    while (pdfDoc.getPageCount() < insertIndex) {
      pdfDoc.addPage([width, height]);
    }

    const insertPage = pdfDoc.insertPage(insertIndex, [width, height]);
    insertPage.doc = pdfDoc;

    await drawAmountTable(insertPage, width, height, total, permitFee, manufacturer);
    await drawSignatureLayout(insertPage, width, height, signAnchor, customerName);
  }

  /* ---------- APPEND PAGE (ALWAYS) ---------- */
  const lastPage = pdfDoc.addPage([width, height]);
  lastPage.doc = pdfDoc;

  await drawAmountTable(lastPage, width, height, total, permitFee, manufacturer);
  await drawSignatureLayout(lastPage, width, height, signAnchor, customerName);

  const outPath = path.join(
    path.dirname(originalPath),
    `merged-${Date.now()}-${path.basename(originalPath)}`
  );

  fs.writeFileSync(outPath, await pdfDoc.save());

  return {
    mergedPath: outPath,
    anchorString: signAnchor,
    dateAnchorString: DATE_ANCHOR,
  };
}

module.exports = {
  insertAndAppendSignaturePages,
};
