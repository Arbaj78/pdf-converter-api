// src/services/pdfEditorService.js

const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

/**
 * Unique anchor for DocuSign
 * (Used only on RIGHT SIDE signature area)
 */
const genAnchor = () =>
  `##SIGN_HERE_${Date.now()}_${Math.floor(Math.random() * 10000)}##`;

/**
 * Draws the custom signature page exactly like the screenshot
 */
async function drawSignatureLayout(page, width, height, anchorText) {
  const font = await page.doc.embedFont(StandardFonts.Helvetica);

  // Layout constants
  const marginX = 40;
  const columnGap = 40;
  const columnWidth = (width - marginX * 2 - columnGap) / 2;

  const topLineY = height - 120;
  const textY = topLineY - 25;
  const bottomLineY = textY - 30;

  const leftX = marginX;
  const rightX = marginX + columnWidth + columnGap;

  // ---------- LEFT COLUMN ----------
  // Top line
  page.drawLine({
    start: { x: leftX, y: topLineY },
    end: { x: leftX + columnWidth, y: topLineY },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  // Name
  page.drawText('customer signature', {
    x: leftX,
    y: textY,
    size: 12,
    font,
  });

  // Date label
  page.drawText('Date', {
    x: leftX,
    y: textY - 18,
    size: 10,
    font,
  });

  // Bottom line
  page.drawLine({
    start: { x: leftX, y: bottomLineY },
    end: { x: leftX + columnWidth, y: bottomLineY },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  // ---------- RIGHT COLUMN ----------
  // Top line
  page.drawLine({
    start: { x: rightX, y: topLineY },
    end: { x: rightX + columnWidth, y: topLineY },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  // Sales Office
  page.drawText('Sales Office', {
    x: rightX,
    y: textY,
    size: 12,
    font,
  });

  // Date label
  page.drawText('Date', {
    x: rightX,
    y: textY - 18,
    size: 10,
    font,
  });

  // DocuSign anchor (RIGHT SIDE ONLY)
  page.drawText(anchorText, {
    x: rightX,
    y: textY - 35,
    size: 8,
    font,
    color: rgb(1, 1, 1), // invisible but detectable
  });

  // Bottom line
  page.drawLine({
    start: { x: rightX, y: bottomLineY },
    end: { x: rightX + columnWidth, y: bottomLineY },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
}

/**
 * Insert signature page at given index AND append at last page
 */
async function insertAndAppendSignaturePages(originalPath, insertIndex1Based) {
  if (!fs.existsSync(originalPath)) {
    throw new Error('Original PDF not found');
  }

  const bytes = fs.readFileSync(originalPath);
  const pdfDoc = await PDFDocument.load(bytes);

  const pages = pdfDoc.getPages();
  const { width, height } = pages[0].getSize();

  const insertIndex = Math.max(0, insertIndex1Based - 1);
  const anchorString = genAnchor();

  // Pad pages if index is greater than page count
  while (pdfDoc.getPageCount() < insertIndex) {
    pdfDoc.addPage([width, height]);
  }

  // ---------- INSERT PAGE ----------
  const insertedPage = pdfDoc.insertPage(insertIndex, [width, height]);
  insertedPage.doc = pdfDoc;
  await drawSignatureLayout(insertedPage, width, height, anchorString);

  // ---------- APPEND PAGE ----------
  const appendedPage = pdfDoc.addPage([width, height]);
  appendedPage.doc = pdfDoc;
  await drawSignatureLayout(appendedPage, width, height, anchorString);

  // Save merged PDF
  const outDir = path.dirname(originalPath);
  const mergedName = `merged-${Date.now()}-${path.basename(originalPath)}`;
  const mergedPath = path.join(outDir, mergedName);

  const mergedBytes = await pdfDoc.save();
  fs.writeFileSync(mergedPath, mergedBytes);

  return { mergedPath, anchorString };
}

module.exports = {
  insertAndAppendSignaturePages,
};
