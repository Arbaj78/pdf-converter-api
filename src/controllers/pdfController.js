const path = require('path');
const fs = require('fs');
const pdfService = require('../services/pdfService');
const supabase = require('../config/supabase');
const { cleanupFiles } = require('../utils/fileHelper');

exports.handleConversion = async (req, res) => {
    // 1. Validations
    if (!req.file) return res.status(400).send('No file uploaded');
    
    // n8n se aane wale fields (Added total_investment_amount)
    const { uuid, terms_conditions_page_no, total_investment_amount } = req.body; 

    if (!uuid) {
        return res.status(400).json({ error: 'UUID is required to update the record' });
    }

    const filePath = req.file.path;
    const outputDir = path.join(__dirname, '../../output');
    
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const filePrefix = path.basename(filePath, path.extname(filePath));

    try {
        console.log(`[Controller] Starting conversion for UUID: ${uuid}`);

        // 2. PDF to Images Conversion
        await pdfService.convertPdfToImages(filePath, outputDir, filePrefix, terms_conditions_page_no);

        // 3. Generated Files Read karein
        const allFiles = fs.readdirSync(outputDir);
        const generatedImages = allFiles
            .filter(f => f.startsWith(filePrefix) && (f.endsWith('.jpg') || f.endsWith('.jpeg')))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        // 4. HubSpot Upload
        const imageUrls = [];
        for (const imgName of generatedImages) {
            const fullImgPath = path.join(outputDir, imgName);
            const publicUrl = await pdfService.uploadToHubSpot(fullImgPath, imgName);
            if (publicUrl) {
                imageUrls.push(publicUrl);
            }
        }

        // 5. SUPABASE UPDATE (Added total_investment_amount here)
        const { data, error } = await supabase
            .from('pdf_conversions')
            .update({ 
                image_urls: imageUrls,
                processed_pages: terms_conditions_page_no || 'all',
                total_investment_amount: total_investment_amount // Data save ho raha hai
            })
            .eq('id', uuid)
            .select();

        if (error) throw error;

        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'No record found in Supabase' });
        }

        // 6. Success Response
        res.json({ 
            success: true, 
            id: uuid, 
            amount_saved: total_investment_amount, 
            images: imageUrls 
        });

        // 7. Cleanup
        const filesToDelete = [filePath, ...generatedImages.map(img => path.join(outputDir, img))];
        cleanupFiles(filesToDelete);

    } catch (error) {
        console.error("[Controller] Critical Error:", error);
        res.status(500).json({ error: 'Processing failed', details: error.message });
    }
};

// Frontend ke liye Get Result function
exports.getResult = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase
        .from('pdf_conversions')
        // select mein total_investment_amount add kiya taaki frontend fetch kar sake
        .select('image_urls, created_at, total_investment_amount') 
        .eq('id', id)
        .single();

    if (error || !data) return res.status(404).json({ error: 'Record not found' });
    
    res.json({ 
        success: true, 
        images: data.image_urls, 
        total_investment_amount: data.total_investment_amount, // Frontend calculation ke liye
        date: data.created_at 
    });
};