const path = require('path');
const fs = require('fs');
const pdfService = require('../services/pdfService');
const supabase = require('../config/supabase');
const { cleanupFiles } = require('../utils/fileHelper');

// Delay function taaki n8n/HubSpot par load na pade
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

exports.handleConversion = async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded');
    
    const { uuid, terms_conditions_page_no, total_investment_amount } = req.body;
    if (!uuid) {
        if (req.file.path) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'UUID is required' });
    }

    const filePath = req.file.path;
    const outputDir = path.join(__dirname, '../../output');
    const filePrefix = "page"; 
    
    let generatedImagesFullPaths = []; 

    try {
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        // 1. Convert PDF to Images
        await pdfService.convertPdfToImages(filePath, outputDir, filePrefix, terms_conditions_page_no);

        // 2. Read and Sort
        const allFiles = fs.readdirSync(outputDir);
        const generatedImages = allFiles
            .filter(f => f.startsWith(filePrefix) && f.endsWith('.jpg'))
            .sort((a, b) => {
                const numA = parseInt(a.match(/\d+/));
                const numB = parseInt(b.match(/\d+/));
                return numA - numB;
            });

        generatedImagesFullPaths = generatedImages.map(img => path.join(outputDir, img));
        console.log(`[Controller] Found ${generatedImages.length} images to upload.`);

        // 3. HubSpot Upload with DELAY
        const imageUrls = [];
        for (const imgName of generatedImages) {
            const fullImgPath = path.join(outputDir, imgName);
            
            console.log(`[Controller] Uploading: ${imgName}...`);
            const publicUrl = await pdfService.uploadToHubSpot(fullImgPath, imgName);
            
            if (publicUrl) {
                console.log(`[Controller] Success: ${imgName}`);
                imageUrls.push(publicUrl);
            } else {
                console.error(`[Controller] Failed to get URL for: ${imgName}`);
            }

            // 1 second ka gap taaki n8n block na ho
            await delay(1000); 
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

        res.json({
            success: true,
            id: uuid,
            amount_saved: total_investment_amount,
            images: imageUrls
        });

    } catch (error) {
        console.error("[Controller] Error:", error);
        res.status(500).json({ error: 'Processing failed' });
    } finally {
        // 5. Cleanup
        console.log("[Controller] Running Auto-Cleanup...");
        const filesToDelete = [filePath, ...generatedImagesFullPaths];
        cleanupFiles(filesToDelete);
    }
};


// Frontend ke liye Get Result function (No changes needed here)
exports.getResult = async (req, res) => {
    const { id } = req.params;
    try {
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
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
};