const fs = require('fs');

const cleanupFiles = (filesToDelete) => {
  filesToDelete.forEach(file => {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch (e) {
      console.error('[Cleanup] File Error:', e.message);
    }
  });
};

// Naya function: Pura folder ek saath udaane ke liye
const cleanupFolder = (folderPath) => {
  try {
    if (fs.existsSync(folderPath)) {
      // recursive: true se folder ke andar ki sabhi files bhi delete ho jayengi
      fs.rmSync(folderPath, { recursive: true, force: true });
      console.log(`[Cleanup] Successfully removed folder: ${folderPath}`);
    }
  } catch (e) {
    console.error('[Cleanup] Folder Error:', e.message);
  }
};

module.exports = { cleanupFiles, cleanupFolder };