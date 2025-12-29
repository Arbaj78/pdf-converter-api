const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const convertPdfToImages = (filePath, outputDir, filePrefix, lastPage) => {
  return new Promise((resolve, reject) => {
    const normalizedFilePath = path.resolve(filePath);
    const normalizedOutputPath = path.join(outputDir, filePrefix);

    let pageLimitFlag = "";
    if (lastPage && !isNaN(lastPage)) {
      pageLimitFlag = `-f 1 -l ${lastPage}`;
    }

    const command = `pdftoppm ${pageLimitFlag} -jpeg "${normalizedFilePath}" "${normalizedOutputPath}"`;

    console.log(`[PDF Service] Executing: ${command}`);

    exec(command, (error) => {
      if (error) {
        console.error("[PDF Service] Conversion Error:", error);
        return reject(error);
      }
      
      // FIX: Wait 500ms for OS to index the new files before resolving
      // Isse senior ka "Page 1 missing" wala issue solve ho jayega
      setTimeout(() => {
        resolve('Success');
      }, 500);
    });
  });
};

const uploadToHubSpot = async (filePath, fileName) => {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('file_name', fileName);

  try {
    const response = await axios.post('https://n8n.srv1070451.hstgr.cloud/webhook/upload_img_to_hubspot_folder', form, {
      headers: { ...form.getHeaders() }
    });
    return response.data.url || response.data;
  } catch (error) {
    console.error(`[PDF Service] HubSpot Upload Failed for ${fileName}:`, error.message);
    return null;
  }
};

module.exports = { convertPdfToImages, uploadToHubSpot };