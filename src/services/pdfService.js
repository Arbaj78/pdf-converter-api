const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

/**
 * PDF ko images mein convert karta hai.
 * @param {string} lastPage - Kitne page tak convert karna hai (n8n se aayega).
 */
const convertPdfToImages = (filePath, outputDir, filePrefix, lastPage) => {
  return new Promise((resolve, reject) => {
    const normalizedFilePath = path.resolve(filePath);
    const normalizedOutputPath = path.join(outputDir, filePrefix);

    // --- UPDATED LOGIC START ---

    // 1. Hamesha page 1 se start karne ke liye '-f 1' force kiya gaya hai.
    // 2. '-sep "_"' add kiya hai taaki filename 'prefix_1.jpg' format mein bane.
    let pageLimitFlag = "-f 1";

    if (lastPage && !isNaN(lastPage)) {
      pageLimitFlag += ` -l ${lastPage}`;
    }

    /* // Purana logic (Commented out as per your request):
    // let pageLimitFlag = "";
    // if (lastPage && !isNaN(lastPage)) {
    //   pageLimitFlag = `-f 1 -l ${lastPage}`;
    // }
    */

    // Final command with underscore separator for better sorting
    const command = `pdftoppm ${pageLimitFlag} -sep "_" -jpeg "${normalizedFilePath}" "${normalizedOutputPath}"`;

    // --- UPDATED LOGIC END ---

    console.log(`[PDF Service] Executing: ${command}`);

    exec(command, (error) => {
      if (error) {
        console.error("[PDF Service] Conversion Error:", error);
        return reject(error);
      }
      resolve('Success');
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

    // n8n response se URL nikalna
    return response.data.url || response.data;
  } catch (error) {
    console.error(`[PDF Service] HubSpot Upload Failed for ${fileName}:`, error.message);
    return null;
  }
};

module.exports = { convertPdfToImages, uploadToHubSpot };