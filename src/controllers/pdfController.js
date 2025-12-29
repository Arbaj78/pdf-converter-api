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
    
    // 1. Unique folder for every request
    const requestFolderName = `req_${uuid}_${Date.now()}`;
    const requestFolder = path.join(__dirname, '../../output', requestFolderName);
    
    if (!fs.existsSync(requestFolder)) {
        fs.mkdirSync(requestFolder, { recursive: true });
    }

    // Prefix "page" format: pdftoppm use karke "page-1.jpg" banayega
    const filePrefix = "page"; 

    try {
        console.log(`[Controller] Starting conversion for UUID: ${uuid}`);

        // 2. Conversion (pdfService now includes a 1s wait internally)
        await pdfService.convertPdfToImages(filePath, requestFolder, filePrefix, terms_conditions_page_no);

        // 3. Robust File Reading Logic (Verify and Retry)
        let generatedImages = [];
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
            const files = fs.readdirSync(requestFolder);
            generatedImages = files
                .filter(f => f.startsWith(filePrefix) && (f.endsWith('.jpg') || f.endsWith('.jpeg')))
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

            // Agar files mil gayi hain, toh loop se bahar niklein
            if (generatedImages.length > 0) break;

            // Agar nahi mili, toh 500ms wait karke dubara koshish karein
            console.log(`[Controller] Files not visible yet, retry ${retryCount + 1}/${maxRetries}...`);
            await new Promise(resolve => setTimeout(resolve, 500));
            retryCount++;
        }

        if (generatedImages.length === 0) {
            throw new Error("No images were generated or could be read from the disk.");
        }

        console.log(`[Controller] Successfully found ${generatedImages.length} images. Starting upload...`);

        // 4. Upload to HubSpot
        const imageUrls = [];
        for (const imgName of generatedImages) {
            const fullImgPath = path.join(requestFolder, imgName);
            const publicUrl = await pdfService.uploadToHubSpot(fullImgPath, imgName);
            
            // HubSpot response handle karna (Object mapping)
            if (publicUrl) {
                // Agar publicUrl ek object hai toh pure object ko push karein
                imageUrls.push(typeof publicUrl === 'string' ? { public_url: publicUrl, name: imgName } : publicUrl);
            }
        }

        // 5. Update Supabase
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

        // 6. Final Response
        res.json({ 
            success: true, 
            id: uuid, 
            amount_saved: total_investment_amount,
            images: imageUrls 
        });

        // 7. Final Cleanup
        cleanupFolder(requestFolder);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    } catch (error) {
        console.error("[Controller] Critical Error:", error);
        cleanupFolder(requestFolder);
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