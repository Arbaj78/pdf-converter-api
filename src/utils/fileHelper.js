// src/utils/fileHelper.js
const fs = require('fs');

/**
 * Temporary files aur images ko delete karne ke liye utility function.
 * @param {Array} filesToDelete - Files ke full paths ki array.
 */
const cleanupFiles = (filesToDelete) => {
  // --- UPDATED LOGIC ---
  // Console log add kiya hai taaki debugging mein asani ho
  console.log(`[FileHelper] Starting cleanup for ${filesToDelete.length} items...`);

  filesToDelete.forEach(file => {
    try {
      // Check if file exists before deleting
      if (file && fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(`[FileHelper] Successfully deleted: ${file}`);
      } else {
        // --- Optional Commentout (Agar file nahi milti toh kya karein) ---
        // console.log(`[FileHelper] File not found, skipping: ${file}`);
      }
    } catch (e) {
      console.error(`[FileHelper] Error deleting file ${file}:`, e.message);
    }
  });
};

/* // Purana simple logic (Commented out as requested):
const cleanupFiles_Old = (filesToDelete) => {
  filesToDelete.forEach(file => {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch (e) {
      console.error('Cleanup Error:', e);
    }
  });
};
*/

module.exports = { cleanupFiles };