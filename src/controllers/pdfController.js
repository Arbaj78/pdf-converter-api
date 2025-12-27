const path = require('path');
const fs = require('fs');
const pdfService = require('../services/pdfService');
const supabase = require('../config/supabase');
const { cleanupFiles } = require('../utils/fileHelper');

exports.handleConversion = async (req, res) => {
    // 1. Validations
    if (!req.file) return res.status(400).send('No file uploaded');
    
    // n8n se aane wale fields
    const { uuid, terms_conditions_page_no } = req.body; 

    if (!uuid) {
        return res.status(400).json({ error: 'UUID is required to update the record' });
    }

    const filePath = req.file.path;
    const outputDir = path.join(__dirname, '../../output');
    
    // Output directory ensure karein
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const filePrefix = path.basename(filePath, path.extname(filePath));

    try {
        console.log(`[Controller] Starting conversion for UUID: ${uuid}, Max Pages: ${terms_conditions_page_no || 'All'}`);

        // 2. PDF to Images Conversion (Limit apply kar di gayi hai)
        await pdfService.convertPdfToImages(filePath, outputDir, filePrefix, terms_conditions_page_no);

        // 3. Generated Files Read karein
        const allFiles = fs.readdirSync(outputDir);
        const generatedImages = allFiles
            .filter(f => f.startsWith(filePrefix) && (f.endsWith('.jpg') || f.endsWith('.jpeg')))
            .sort((a, b) => {
                // Numeric sort taaki page-1, page-2 sequence mein rahein
                return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
            });

        // 4. HubSpot Upload
        const imageUrls = [];
        for (const imgName of generatedImages) {
            const fullImgPath = path.join(outputDir, imgName);
            const publicUrl = await pdfService.uploadToHubSpot(fullImgPath, imgName);
            if (publicUrl) {
                imageUrls.push(publicUrl);
            }
        }

        // 5. SUPABASE UPDATE
        const { data, error } = await supabase
            .from('pdf_conversions')
            .update({ 
                image_urls: imageUrls,
                // Optional: aap record mein ye bhi save kar sakte hain ki kitne page process huye
                processed_pages: terms_conditions_page_no || 'all' 
            })
            .eq('id', uuid)
            .select();

        if (error) throw error;

        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'No record found with the provided UUID in Supabase' });
        }

        // 6. Success Response
        res.json({ 
            success: true, 
            id: uuid, 
            pages_processed: terms_conditions_page_no || 'all',
            images_count: imageUrls.length,
            images: imageUrls 
        });

        // 7. Cleanup local files
        const filesToDelete = [filePath, ...generatedImages.map(img => path.join(outputDir, img))];
        cleanupFiles(filesToDelete);

    } catch (error) {
        console.error("[Controller] Critical Error:", error);
        res.status(500).json({ error: 'Processing failed', details: error.message });
    }
};

exports.getResult = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase
        .from('pdf_conversions')
        .select('image_urls, created_at')
        .eq('id', id)
        .single();

    if (error || !data) return res.status(404).json({ error: 'Record not found' });
    res.json({ success: true, images: data.image_urls, date: data.created_at });
};