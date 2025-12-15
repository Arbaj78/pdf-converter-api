const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const pdf = require('pdf-poppler');
const fs = require('fs');
const archiver = require('archiver'); // New Import

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// --- Multer Storage ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    // Unique name dete hain taaki mix na ho
    cb(null, Date.now() + path.extname(file.originalname)); 
  }
});
const upload = multer({ storage: storage });

// --- Helper Function: Folder Clean karne ke liye ---
const cleanupFiles = (filesToDelete) => {
  filesToDelete.forEach(file => {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });
};

// --- API Route ---
app.post('/convert', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded');

  const filePath = req.file.path; // Uploaded PDF
  const outputDir = path.join(__dirname, '../output'); 
  const filePrefix = path.basename(filePath, path.extname(filePath)); // Unique ID

  try {
    // 1. PDF Convert karo
    let opts = {
      format: 'jpeg',
      out_dir: outputDir,
      out_prefix: filePrefix,
      page: null
    };

    await pdf.convert(filePath, opts);

    // 2. ZIP File create karo
    const zipName = `${filePrefix}.zip`;
    const zipPath = path.join(outputDir, zipName);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    // ZIP close hone par kya karein? (Download bhejein)
    output.on('close', () => {
      res.download(zipPath, 'converted_images.zip', (err) => {
        if (err) console.error('Download Error:', err);

        // 4. CLEANUP: Sab kuch delete kar do (PDF, Images, Zip)
        // Pehle images dhoondo
        const allFiles = fs.readdirSync(outputDir);
        const generatedImages = allFiles
            .filter(f => f.startsWith(filePrefix) && f !== zipName)
            .map(f => path.join(outputDir, f));

        const filesToDelete = [filePath, zipPath, ...generatedImages];
        cleanupFiles(filesToDelete);
        console.log('Cleanup done!');
      });
    });

    archive.pipe(output);

    // 3. Images ko ZIP mein add karo
    // Output folder check karo aur sirf is request ki images uthao
    const files = fs.readdirSync(outputDir);
    files.forEach(file => {
      // Sirf wahi files jo abhi convert hui hain (Prefix match)
      if (file.startsWith(filePrefix) && (file.endsWith('.jpg') || file.endsWith('.jpeg'))) {
        archive.file(path.join(outputDir, file), { name: file });
      }
    });

    archive.finalize(); // Zip pack kar do

  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error processing PDF');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});