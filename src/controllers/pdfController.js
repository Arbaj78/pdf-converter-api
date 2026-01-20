// src/controllers/pdfController.js

const path = require('path');
const fs = require('fs');
const axios = require('axios');

/**
 * 🔹 NEW: pdfEditorService
 * This service is responsible ONLY for:
 * - inserting a custom page at a given index
 * - inserting the same page at the end
 * - returning merged PDF path + anchor string
 */
const pdfEditor = require('../services/pdfEditorService');

const pdfService = require('../services/pdfService');
const supabase = require('../config/supabase');
const { cleanupFiles } = require('../utils/fileHelper');

// ------------------------------------
// Utility: Delay (unchanged)
// ------------------------------------
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/* ==========================================================
   1. PDF Conversion + Signature Page Injection (UPDATED)
========================================================== */
exports.handleConversion = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const {
    uuid,
    terms_conditions_page_no, // existing use: how many pages to convert to images
    insert_index,             // 🔹 NEW: page index where signature page must be inserted
    total_investment_amount,
    permit_fee,
    manufacturer,
    customer_full_name,
    customer_email
  } = req.body;

  if (!uuid) {
    if (req.file.path) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'UUID is required' });
  }

  const originalPdfPath = req.file.path;
  const outputDir = path.join(__dirname, '../../output');
  const filePrefix = 'page';

  let generatedImagesFullPaths = [];
  let mergedPdfPath = null;     // 🔹 NEW
  let anchorString = null;      // 🔹 NEW

  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    /* ======================================================
       🔹 STEP 1: INSERT CUSTOM PAGE INTO PDF (NEW)
       - Insert page at given index (ex: 3rd page)
       - Also insert same page at last
       - This happens BEFORE image conversion
    ====================================================== */
    const insertAt = parseInt(insert_index || 3, 10); // default = 3rd page
    const totalInv = parseFloat(total_investment_amount || 0);
    const permit = parseFloat(permit_fee || 0);

const result = await pdfEditor.insertAndAppendSignaturePages(
  originalPdfPath,
  insertAt,
  customer_full_name || '',
  totalInv,
  permit,
  manufacturer || ''
);

    mergedPdfPath = result.mergedPath;
    anchorString = result.anchorString;

    /* ======================================================
       🔹 STEP 2: UPLOAD MODIFIED PDF TO HUBSPOT (NEW)
       - This PDF is what n8n + DocuSign will use
    ====================================================== */
    const mergedPdfName = path.basename(mergedPdfPath);
    const modifiedPdfUrl = await pdfService.uploadToHubSpot(
      mergedPdfPath,
      mergedPdfName
    );

    /* ======================================================
       🔹 STEP 3: SAVE MODIFIED PDF URL + ANCHOR TO SUPABASE (NEW)
       - n8n will later read this URL and send to DocuSign
    ====================================================== */
    const { error: updatePdfError } = await supabase
      .from('pdf_conversions')
      .update({
        modified_pdf_url: modifiedPdfUrl,
        anchor_string: anchorString,
        pdf_status: 'ready'
      })
      .eq('id', uuid);

    if (updatePdfError) throw updatePdfError;

    /* ======================================================
       🔹 STEP 4: CONVERT *MERGED PDF* TO IMAGES (UPDATED)
       - Existing logic, only input PDF changed
    ====================================================== */
    await pdfService.convertPdfToImages(
      mergedPdfPath,
      outputDir,
      filePrefix,
      terms_conditions_page_no
    );

    const generatedImages = fs.readdirSync(outputDir)
      .filter(f => f.startsWith(filePrefix) && f.endsWith('.jpg'))
      .sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));

    generatedImagesFullPaths = generatedImages.map(img =>
      path.join(outputDir, img)
    );

    /* ======================================================
       🔹 STEP 5: UPLOAD IMAGES TO HUBSPOT (UNCHANGED)
    ====================================================== */
    const imageUrls = [];
    for (const imgName of generatedImages) {
      const fullImgPath = path.join(outputDir, imgName);
      const publicUrl = await pdfService.uploadToHubSpot(fullImgPath, imgName);
      if (publicUrl) imageUrls.push(publicUrl);
      await delay(1000);
    }

    /* ======================================================
       🔹 STEP 6: UPDATE IMAGE DATA IN SUPABASE (UNCHANGED)
    ====================================================== */
    const { error } = await supabase
      .from('pdf_conversions')
      .update({
        image_urls: imageUrls,
        processed_pages: terms_conditions_page_no || 'all',
        total_investment_amount,
        permit_fee,
        manufacturer,
        customer_full_name,
        customer_email
      })
      .eq('id', uuid);

    if (error) throw error;

    return res.json({
      success: true,
      id: uuid,
      images: imageUrls,
      modified_pdf_url: modifiedPdfUrl
    });

  } catch (error) {
    console.error('[handleConversion]', error);
    return res.status(500).json({ error: 'Processing failed' });
  } finally {
    /* ======================================================
       🔹 STEP 7: CLEANUP (UPDATED)
       - Original PDF
       - Merged PDF
       - Generated images
       - Keeps backend load minimal
    ====================================================== */
    const cleanupTargets = [originalPdfPath];
    if (mergedPdfPath) cleanupTargets.push(mergedPdfPath);
    cleanupFiles(cleanupTargets.concat(generatedImagesFullPaths));
  }
};

/* ==========================================================
   2. Get Result (UNCHANGED)
========================================================== */
exports.getResult = async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('pdf_conversions')
      .select(
        'image_urls, created_at, total_investment_amount, permit_fee, manufacturer, is_signed, signed_pdf_url, signing_url, customer_full_name, customer_email, modified_pdf_url'
      )
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Record not found' });
    }

    return res.json({
      success: true,
      images: data.image_urls,
      modified_pdf_url: data.modified_pdf_url,
      total_investment_amount: data.total_investment_amount,
      permit_fee: data.permit_fee,
      manufacturer: data.manufacturer,
      is_signed: data.is_signed || false,
      signed_pdf_url: data.signed_pdf_url || null,
      signing_url: data.signing_url || null,
      customer_full_name: data.customer_full_name,
      customer_email: data.customer_email,
      date: data.created_at
    });

  } catch (err) {
    console.error('[getResult]', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
