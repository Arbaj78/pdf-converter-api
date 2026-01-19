// src/routes/pdfRoutes.js

const router = require('express').Router();
const pdfController = require('../controllers/pdfController');
const upload = require('../config/multerConfig');

// 1. Existing: PDF processing and HubSpot/Supabase upload
router.post('/convert', upload.single('file'), pdfController.handleConversion);

// 2. Existing: Fetch data and signature status for frontend
router.get('/result/:id', pdfController.getResult);



module.exports = router;