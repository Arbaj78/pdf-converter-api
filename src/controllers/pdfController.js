// src/controllers/pdfController.js

const path = require('path');
const fs = require('fs');

const { validateService } = require('../utils/serviceValidator');
const { resolvePdfTable } = require('../services/pdfTableResolver');

const pdfEditor = require('../services/pdfEditorService');
const pdfService = require('../services/pdfService');
const supabase = require('../config/supabase');
const { cleanupFiles } = require('../utils/fileHelper');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function markRecordFailed(table, id, reason) {
  if (!table || !id) return;
  try {
    await supabase
      .from(table)
      .update({
        pdf_status: 'failed',
        error_message: reason ? String(reason).slice(0, 2000) : null
      })
      .eq('id', id);
  } catch (err) {
    console.error('[markRecordFailed]', err);
  }
}

/* ==========================================================
   1. Handle PDF Conversion
========================================================== */
exports.handleConversion = async (req, res) => {
  let service;
  let table;

  try {
    service = validateService(req.body.service);
    table = resolvePdfTable(service);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const {
    uuid,
    terms_conditions_page_no,
    insert_index,
    total_investment_amount,
    permit_fee,
    manufacturer,
    customer_full_name,
    customer_email
  } = req.body;

  if (!uuid) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'UUID is required' });
  }

  const originalPdfPath = req.file.path;
  const outputDir = path.join(__dirname, '../../output');
  const filePrefix = 'page';

  let mergedPdfPath = null;
  let anchorString = null;
  let generatedImagesFullPaths = [];

  try {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    /* ======================================================
       STEP 1: MARK RECORD AS PROCESSING
    ====================================================== */
    const { data: existing } = await supabase
      .from(table)
      .select('id')
      .eq('id', uuid)
      .single();

    if (!existing) {
      fs.unlinkSync(originalPdfPath);
      return res.status(404).json({ error: 'Record not found (n8n row missing)' });
    }

    await supabase
      .from(table)
      .update({
        pdf_status: 'processing',
        customer_full_name,
        customer_email
      })
      .eq('id', uuid);

    /* ======================================================
       STEP 2: INSERT SIGNATURE PAGE
    ====================================================== */
    const insertAt =
      Number.isInteger(Number(insert_index)) && Number(insert_index) > 0
        ? Number(insert_index)
        : null;

    const result = await pdfEditor.insertAndAppendSignaturePages(
      originalPdfPath,
      insertAt,
      customer_full_name || '',
      parseFloat(total_investment_amount || 0),
      parseFloat(permit_fee || 0),
      manufacturer || ''
    );

    mergedPdfPath = result.mergedPath;
    anchorString = result.anchorString;

    /* ======================================================
       STEP 3: UPLOAD MODIFIED PDF
    ====================================================== */
    const modifiedPdfUrl = await pdfService.uploadToHubSpot(
      mergedPdfPath,
      path.basename(mergedPdfPath)
    );

    if (!modifiedPdfUrl) throw new Error('PDF upload failed');

    await supabase
      .from(table)
      .update({
        modified_pdf_url: modifiedPdfUrl,
        anchor_string: anchorString
      })
      .eq('id', uuid);

    /* ======================================================
       STEP 4: CONVERT PDF TO IMAGES
    ====================================================== */
    await pdfService.convertPdfToImages(
      mergedPdfPath,
      outputDir,
      filePrefix,
      terms_conditions_page_no
    );

    const images = fs.readdirSync(outputDir)
      .filter(f => f.startsWith(filePrefix) && f.endsWith('.jpg'))
      .sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));

    generatedImagesFullPaths = images.map(img => path.join(outputDir, img));

    /* ======================================================
       STEP 5: UPLOAD IMAGES
    ====================================================== */
    const imageUrls = [];
    for (const img of images) {
      const url = await pdfService.uploadToHubSpot(
        path.join(outputDir, img),
        img
      );
      if (url) imageUrls.push(url);
      await delay(800);
    }

    /* ======================================================
       STEP 6: APPEND IMAGE URLS (IMPORTANT FIX)
    ====================================================== */
  await supabase
  .from(table)
  .update({
    image_urls: imageUrls
  })
  .eq('id', uuid);


    await supabase
      .from(table)
      .update({
        pdf_status: 'ready',
        processed_pages: terms_conditions_page_no || 'all',
        total_investment_amount,
        permit_fee,
        manufacturer
      })
      .eq('id', uuid);

    return res.json({
      success: true,
      service,
      id: uuid,
      images: imageUrls,
      modified_pdf_url: modifiedPdfUrl
    });

  } catch (err) {
    console.error('[handleConversion]', err);
    await markRecordFailed(table, uuid, err.message || err);
    return res.status(500).json({ error: 'Processing failed' });
  } finally {
    cleanupFiles([originalPdfPath, mergedPdfPath, ...generatedImagesFullPaths].filter(Boolean));
  }
};

/* ==========================================================
   2. Get Result
========================================================== */
exports.getResult = async (req, res) => {
  let service, table;

  try {
    service = validateService(req.query.service);
    table = resolvePdfTable(service);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const { id } = req.params;

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Record not found' });

  return res.json({ success: true, service, ...data });
};
