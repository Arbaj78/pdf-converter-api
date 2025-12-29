const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

/**
 * PDF ko images mein convert karta hai.
 */
const convertPdfToImages = (filePath, outputDir, filePrefix, lastPage) => {
  return new Promise((resolve, reject) => {
    const normalizedFilePath = path.resolve(filePath);
    const normalizedOutputPath = path.join(outputDir, filePrefix);

    let pageLimitFlag = "";
    if (lastPage && !isNaN(lastPage)) {
      pageLimitFlag = `-f 1 -l ${lastPage}`;
    }

    // UPDATE: '-sep -' flag add kiya hai taaki files 'page-1.jpg' format mein bane
    // Isse sorting aur identify karna aasaan ho jata hai
    const command = `pdftoppm ${pageLimitFlag} -jpeg -sep - "${normalizedFilePath}" "${normalizedOutputPath}"`;

    console.log(`[PDF Service] Executing: ${command}`);

    exec(command, (error) => {
      if (error) {
        console.error("[PDF Service] Conversion Error:", error);
        return reject(error);
      }
      
      // FIX: Render par disk I/O slow hota hai.
      // 1000ms (1 second) ka wait ensure karega ki Page 1 aur baaki files 
      // OS ki directory listing mein register ho jayein.
      console.log(`[PDF Service] Conversion finished, waiting 1s for file system sync...`);
      setTimeout(() => {
        resolve('Success');
      }, 1000); 
    });
  });
};

/**
 * Image ko n8n webhook ke zariye HubSpot par upload karta hai.
 */
const uploadToHubSpot = async (filePath, fileName) => {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('file_name', fileName);

  try {
    const response = await axios.post('https://n8n.srv1070451.hstgr.cloud/webhook/upload_img_to_hubspot_folder', form, {
      headers: { ...form.getHeaders() }
    });
    
    // Check karein ki response mein URL hai ya nahi
    return response.data.url || response.data;
  } catch (error) {
    console.error(`[PDF Service] HubSpot Upload Failed for ${fileName}:`, error.message);
    return null;
  }
};

module.exports = { convertPdfToImages, uploadToHubSpot };