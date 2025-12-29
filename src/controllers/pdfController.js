const path = require('path');
const fs = require('fs');
const pdfService = require('../services/pdfService');
const supabase = require('../config/supabase');
const { cleanupFolder } = require('../utils/fileHelper');

exports.handleConversion = async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded');
    
    const { uuid, terms_conditions_page_no, total_investment_amount } = req.body; 

    if (!uuid) {
        return res.status(400).json({ error: 'UUID is required' });
    }

    const filePath = req.file.path;
    
    // FIX: Unique folder for every request to avoid collisions
    const requestFolderName = `req_${uuid}_${Date.now()}`;
    const requestFolder = path.join(__dirname, '../../output', requestFolderName);
    
    if (!fs.existsSync(requestFolder)) {
        fs.mkdirSync(requestFolder, { recursive: true });
    }

    const filePrefix = "page"; // Static prefix is safe now because folder is unique

    try {
        console.log(`[Controller] Starting conversion for UUID: ${uuid} in unique folder`);

        // 1. Convert
        await pdfService.convertPdfToImages(filePath, requestFolder, filePrefix, terms_conditions_page_no);

        // 2. Read only from the unique folder
        const generatedImages = fs.readdirSync(requestFolder)
            .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg'))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        // 3. Upload to HubSpot
        const imageUrls = [];
        for (const imgName of generatedImages) {
            const fullImgPath = path.join(requestFolder, imgName);
            const publicUrl = await pdfService.uploadToHubSpot(fullImgPath, imgName);
            if (publicUrl) imageUrls.push(publicUrl);
        }

        // 4. Update Supabase
        const { data, error } = await supabase
            .from('pdf_conversions')
            .update({ 
                image_urls: imageUrls,
                processed_pages: terms_conditions_page_no || 'all',
                total_investment_amount: total_investment_amount 
            })
            .eq('id', uuid)
            .select();

        if (error) throw error;

        // 5. Success Response
        res.json({ 
            success: true, 
            id: uuid, 
            amount_saved: total_investment_amount,
            images: imageUrls 
        });

        // 6. Final Cleanup: Delete the entire unique folder and temp PDF
        cleanupFolder(requestFolder);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    } catch (error) {
        console.error("[Controller] Critical Error:", error);
        cleanupFolder(requestFolder); // Cleanup on error too
        res.status(500).json({ error: 'Processing failed', details: error.message });
    }
};

exports.getResult = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase
        .from('pdf_conversions')
        .select('image_urls, created_at, total_investment_amount') 
        .eq('id', id)
        .single();

    if (error || !data) return res.status(404).json({ error: 'Record not found' });
    
    res.json({ 
        success: true, 
        images: data.image_urls, 
        total_investment_amount: data.total_investment_amount,
        date: data.created_at 
    });
};