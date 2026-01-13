// src/routes/pdfRoutes.js

const router = require('express').Router();
const pdfController = require('../controllers/pdfController');
const upload = require('../config/multerConfig');

// 1. Existing: PDF processing and HubSpot/Supabase upload
router.post('/convert', upload.single('file'), pdfController.handleConversion);

// 2. Existing: Fetch data and signature status for frontend
router.get('/result/:id', pdfController.getResult);

// 3. New: Initiate DocuSign signing process via n8n
// router.post('/initiate-sign', pdfController.initiateSigning);

module.exports = router;