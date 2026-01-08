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
        const n8nWebhookUrl = 'https://n8n.srv871973.hstgr.cloud/webhook/docusign-initiate-signing';
        console.log(`[Render] Calling n8n for UUID: ${uuid}`);
        
        // Render optimized: 3 retries
        let attempts = 0;
        let signingUrl = null;
        
        while (attempts < 3 && !signingUrl) {
            try {
                attempts++;
                console.log(`Attempt ${attempts}/3 for UUID: ${uuid}`);
                
                const response = await axios.post(n8nWebhookUrl, { uuid }, {
                    timeout: 40000, // 40s per attempt
                    headers: { 
                        'Content-Type': 'application/json',
                        'User-Agent': 'YourApp/1.0'
                    }
                });
                
                // Extract DocuSign URL from any format
                signingUrl = response.data.signingUrl || 
                           response.data.signing_url || 
                           response.data.url || 
                           response.data;
                           
                if (signingUrl) {
                    console.log(`✓ Got signing URL: ${signingUrl.substring(0, 50)}...`);
                    break;
                }
                
            } catch (err) {
                console.log(`Attempt ${attempts} failed:`, err.code || err.message);
                
                if (attempts < 3) {
                    await delay(3000); // 3s retry delay
                } else {
                    throw new Error(`n8n failed after 3 attempts: ${err.code || err.message}`);
                }
            }
        }

        if (!signingUrl) {
            throw new Error('No signing URL received from n8n');
        }

        // ✅ NO SUPABASE UPDATE - Direct response
        res.json({
            success: true,
            signingUrl: signingUrl  // Exact format you want
        });
        
    } catch (error) {
        console.error("[Render] DocuSign Error:", error.message);
        res.status(500).json({ 
            error: 'Signing URL generation failed',
            code: error.code || 'TIMEOUT'
        });
    }
};