const fs = require('fs');

const cleanupFiles = (filesToDelete) => {
  filesToDelete.forEach(file => {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch (e) {
      console.error('Cleanup Error:', e);
    }
  });
};

module.exports = { cleanupFiles };