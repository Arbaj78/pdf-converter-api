const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const convertPdfToImages = (filePath, outputDir, filePrefix) => {
  return new Promise((resolve, reject) => {
    const normalizedFilePath = path.resolve(filePath);
    const normalizedOutputPath = path.join(outputDir, filePrefix);
    const command = `pdftoppm -jpeg "${normalizedFilePath}" "${normalizedOutputPath}"`;
    
    exec(command, (error) => {
      if (error) return reject(error);
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
    return response.data.url || response.data;
  } catch (error) {
    return null;
  }
};

module.exports = { convertPdfToImages, uploadToHubSpot };