const path = require('path');
const fs = require('fs');
const axios = require('axios');

const pdfService = require('../services/pdfService');
const supabase = require('../config/supabase');
const { cleanupFiles } = require('../utils/fileHelper');

// ------------------------------------
// Utility: Delay
// ------------------------------------
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/* ==========================================================
   1. PDF Conversion & Data Entry (No Changes Needed)
========================================================== */
exports.handleConversion = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const {
    uuid,
    terms_conditions_page_no,
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

  const filePath = req.file.path;
  const outputDir = path.join(__dirname, '../../output');
  const filePrefix = 'page';

  let generatedImagesFullPaths = [];

  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    await pdfService.convertPdfToImages(
      filePath,
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

    const imageUrls = [];
    for (const imgName of generatedImages) {
      const fullImgPath = path.join(outputDir, imgName);
      const publicUrl = await pdfService.uploadToHubSpot(fullImgPath, imgName);
      if (publicUrl) imageUrls.push(publicUrl);
      await delay(1000);
    }

    const { error } = await supabase
      .from('pdf_conversions')
      .update({
        image_urls: imageUrls,
        processed_pages: terms_conditions_page_no || 'all',
        total_investment_amount,
        permit_fee,
        manufacturer,
        customer_full_name, // <-- Save to DB
        customer_email      // <-- Save to D
      })
      .eq('id', uuid);

    if (error) throw error;

    return res.json({
      success: true,
      id: uuid,
      images: imageUrls
    });

  } catch (error) {
    console.error('[handleConversion]', error);
    return res.status(500).json({ error: 'Processing failed' });
  } finally {
    cleanupFiles([filePath, ...generatedImagesFullPaths]);
  }
};

/* ==========================================================
   2. Get Result (UPDATED FOR POLLING)
========================================================== */
exports.getResult = async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('pdf_conversions')
      .select(
        // 🔹 Added 'signing_url' in select query
        'image_urls, created_at, total_investment_amount, permit_fee, manufacturer, is_signed, signed_pdf_url, signing_url, customer_full_name, customer_email'
      )
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Record not found' });
    }

    return res.json({
      success: true,
      images: data.image_urls,
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

