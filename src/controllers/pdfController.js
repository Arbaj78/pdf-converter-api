const path = require('path');
const fs = require('fs');
const pdfService = require('../services/pdfService');
const supabase = require('../config/supabase');
const { cleanupFiles } = require('../utils/fileHelper');

exports.handleConversion = async (req, res) => {
    // 1. Check karein ki file aur UUID dono aaye hain ya nahi
    if (!req.file) return res.status(400).send('No file uploaded');
    
    // n8n se aayi hui UUID req.body mein hogi
    const { uuid } = req.body; 

    if (!uuid) {
        return res.status(400).json({ error: 'UUID is required to update the record' });
    }

    const filePath = req.file.path;
    const outputDir = path.join(__dirname, '../../output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    const filePrefix = path.basename(filePath, path.extname(filePath));

    try {
        // 2. PDF to Images Conversion (Same as before)
        await pdfService.convertPdfToImages(filePath, outputDir, filePrefix);

        const allFiles = fs.readdirSync(outputDir);
        const generatedImages = allFiles
            .filter(f => f.startsWith(filePrefix) && (f.endsWith('.jpg') || f.endsWith('.jpeg')))
            .sort();

        // 3. HubSpot Upload (Same as before)
        const imageUrls = [];
        for (const imgName of generatedImages) {
            const fullImgPath = path.join(outputDir, imgName);
            const publicUrl = await pdfService.uploadToHubSpot(fullImgPath, imgName);
            if (publicUrl) imageUrls.push(publicUrl);
        }

        // 4. SUPABASE UPDATE LOGIC (Main Change Here)
        const { data, error } = await supabase
            .from('pdf_conversions')
            .update({ image_urls: imageUrls }) // image_urls field ko update karein
            .eq('id', uuid) // Filter: Jiska ID n8n wali UUID se match kare
            .select();

        if (error) throw error;

        // Check karein ki kya record sach mein update hua
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'No record found with the provided UUID' });
        }

        // 5. Response wahi bhejien jo update hui hai
        res.json({ success: true, id: uuid, images: imageUrls });

        // 6. Cleanup local files
        const filesToDelete = [filePath, ...generatedImages.map(img => path.join(outputDir, img))];
        cleanupFiles(filesToDelete);

    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: 'Processing failed', details: error.message });
    }
};

// getResult mein koi badlav nahi hoga, wo hamesha ki tarah ID se images fetch karega
exports.getResult = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase
        .from('pdf_conversions')
        .select('image_urls, created_at')
        .eq('id', id)
        .single();

    if (error || !data) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, images: data.image_urls, date: data.created_at });
};