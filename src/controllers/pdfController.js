const path = require('path');
const fs = require('fs');
const axios = require('axios'); 
const pdfService = require('../services/pdfService');
const supabase = require('../config/supabase');
const { cleanupFiles } = require('../utils/fileHelper');

// Delay function taaki HubSpot API rate limits hit na ho
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================================
// 1. PDF Conversion & Data Entry
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

        const allFiles = fs.readdirSync(outputDir);
        const generatedImages = allFiles
            .filter(f => f.startsWith(filePrefix) && f.endsWith('.jpg'))
            .sort((a, b) => {
                const numA = parseInt(a.match(/\d+/));
                const numB = parseInt(b.match(/\d+/));
                return numA - numB;
            });

        generatedImagesFullPaths = generatedImages.map(img => path.join(outputDir, img));

        // HubSpot Upload
        const imageUrls = [];
        for (const imgName of generatedImages) {
            const fullImgPath = path.join(outputDir, imgName);
            // HubSpot upload ke liye 1s ka delay taaki n8n/HubSpot overwhelm na ho
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
        console.error("[Controller] HandleConversion Error:", error.message);
        res.status(500).json({ error: 'Processing failed' });
    } finally {
        const filesToDelete = [filePath, ...generatedImagesFullPaths];
        cleanupFiles(filesToDelete);
    }
};

// ==========================================================
// 2. Get Result (Frontend Check)
// ==========================================================
exports.getResult = async (req, res) => {
    const { id } = req.params;
    try {
        const { data, error } = await supabase
            .from('pdf_conversions')
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
            is_signed: data.is_signed || false,
            signed_pdf_url: data.signed_pdf_url || null,
            date: data.created_at
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// ==========================================================
// 3. Initiate DocuSign Signing (UPDATED FOR RENDER)
// ==========================================================
exports.initiateSigning = async (req, res) => {
    const { uuid } = req.body;
    if (!uuid) return res.status(400).json({ error: 'UUID is required' });

    try {
        // PRODUCTION URL: Confirm karein ki subdomain srv871973 hi hai
        const n8nWebhookUrl = "https://n8n.srv871973.hstgr.cloud/webhook-test/docusign-initiate-signing"; 
        
        console.log(`[Backend] Initiating DocuSign for UUID: ${uuid}`);

        // RENDER FIX: Timeout add kiya hai (60 seconds)
        const response = await axios.post(n8nWebhookUrl, { uuid }, {
            timeout:  120000, 
            headers: { 'Content-Type': 'application/json' }
        });

        // Defensive mapping for different response formats
        const signingUrl = response.data.signingUrl || response.data.signing_url || response.data.url || response.data;

        res.json({
            success: true,
            signingUrl: signingUrl
        });
        
    } catch (error) {
        console.error("--- DocuSign Initiation Error Details ---");
        
        if (error.response) {
            // n8n ne response diya par status code error hai (4xx, 5xx)
            console.error("Status:", error.response.status);
            console.error("n8n Data:", error.response.data);
        } else if (error.request) {
            // Request chali gayi par n8n ne reply nahi diya (Network/Timeout)
            console.error("No response from n8n. Code:", error.code);
            if (error.code === 'ECONNABORTED') console.error("Result: Request Timed Out after 60s");
            if (error.code === 'ENOTFOUND') console.error("Result: DNS Error - Check n8n URL");
        } else {
            console.error("Setup Error:", error.message);
        }
        
        res.status(500).json({ 
            error: 'Could not initiate signing process',
            code: error.code || 'UNKNOWN'
        });
    }
};