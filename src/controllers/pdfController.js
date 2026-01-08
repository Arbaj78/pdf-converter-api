const path = require('path');
const fs = require('fs');
const axios = require('axios'); // n8n webhook trigger karne ke liye
const pdfService = require('../services/pdfService');
const supabase = require('../config/supabase');
const { cleanupFiles } = require('../utils/fileHelper');

// Delay function taaki n8n/HubSpot par load na pade
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================================
// 1. PDF Conversion & Data Entry (n8n to Backend)
// ==========================================================
exports.handleConversion = async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded');
    
    const { 
        uuid, 
        terms_conditions_page_no, 
        total_investment_amount, 
        permit_fee,
        manufacturer 
    } = req.body;
    
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

        // PDF to Images
        await pdfService.convertPdfToImages(filePath, outputDir, filePrefix, terms_conditions_page_no);

        // Read and Sort Images
        const allFiles = fs.readdirSync(outputDir);
        const generatedImages = allFiles
            .filter(f => f.startsWith(filePrefix) && f.endsWith('.jpg'))
            .sort((a, b) => {
                const numA = parseInt(a.match(/\d+/));
                const numB = parseInt(b.match(/\d+/));
                return numA - numB;
            });

        generatedImagesFullPaths = generatedImages.map(img => path.join(outputDir, img));

        // HubSpot Upload with Delay
        const imageUrls = [];
        for (const imgName of generatedImages) {
            const fullImgPath = path.join(outputDir, imgName);
            const publicUrl = await pdfService.uploadToHubSpot(fullImgPath, imgName);
            
            if (publicUrl) {
                imageUrls.push(publicUrl);
            }
            await delay(1000); 
        }

        // Supabase Update
        const { data, error } = await supabase
            .from('pdf_conversions')
            .update({
                image_urls: imageUrls,
                processed_pages: terms_conditions_page_no || 'all',
                total_investment_amount: total_investment_amount,
                permit_fee: permit_fee,
                manufacturer: manufacturer
            })
            .eq('id', uuid)
            .select();

        if (error) throw error;

        res.json({
            success: true,
            id: uuid,
            images: imageUrls
        });

    } catch (error) {
        console.error("[Controller] Error:", error);
        res.status(500).json({ error: 'Processing failed' });
    } finally {
        const filesToDelete = [filePath, ...generatedImagesFullPaths];
        cleanupFiles(filesToDelete);
    }
};

// ==========================================================
// 2. Get Result (Frontend Status & Data Check)
// ==========================================================
exports.getResult = async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase
            .from('pdf_conversions')
            // Status track karne ke liye is_signed aur signed_pdf_url add kiya
            .select('image_urls, created_at, total_investment_amount, permit_fee, manufacturer, is_signed, signed_pdf_url')
            .eq('id', id)
            .single();

        if (error || !data) return res.status(404).json({ error: 'Record not found' });
        
        res.json({
            success: true,
            images: data.image_urls,
            total_investment_amount: data.total_investment_amount,
            permit_fee: data.permit_fee,
            manufacturer: data.manufacturer,
            is_signed: data.is_signed || false, // Status for frontend check
            signed_pdf_url: data.signed_pdf_url || null,
            date: data.created_at
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// ==========================================================
// 3. Initiate DocuSign Signing (Frontend to n8n)
// ==========================================================
exports.initiateSigning = async (req, res) => {
    const { uuid } = req.body;
    if (!uuid) return res.status(400).json({ error: 'UUID is required' });

    try {
        const n8nWebhookUrl = 'https://n8n.srv871973.hstgr.cloud/webhook/docusign-initiate-signing'; 
        
        const response = await axios.post(n8nWebhookUrl, { uuid });

        res.json({
            success: true,
            signingUrl: response.data.signingUrl || response.data.signing_url || response.data
        });
    } catch (error) {
        // Render logs mein asli error dekhne ke liye ye lines zaruri hain
        console.error("DocuSign Initiation Detailed Error:");
        console.error("Status:", error.response?.status); // Kya ye 404 hai ya 500?
        console.error("Data:", error.response?.data);     // n8n ne kya message bheja?
        console.error("Message:", error.message);         // Network timeout hai ya connection refused?
        
        res.status(500).json({ error: 'Could not initiate signing process' });
    }
};