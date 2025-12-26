const router = require('express').Router();
const pdfController = require('../controllers/pdfController');
const upload = require('../config/multerConfig');

router.post('/convert', upload.single('file'), pdfController.handleConversion);
router.get('/result/:id', pdfController.getResult);

module.exports = router;