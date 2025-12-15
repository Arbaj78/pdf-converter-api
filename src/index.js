const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { exec } = require('child_process'); // Native command run karne ke liye

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// --- Multer Storage ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync('uploads')) fs.mkdirSync('uploads'); // Folder ensure karein
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)); 
  }
});
const upload = multer({ storage: storage });

// --- Helper: Conversion Function (Library ki jagah yeh use karenge) ---
const convertPdfToImages = (filePath, outputDir, filePrefix) => {
  return new Promise((resolve, reject) => {
    // Linux command: pdftoppm (Jo humne Dockerfile mein install kiya hai)
    // Command: pdftoppm -jpeg input.pdf output_prefix
    const command = `pdftoppm -jpeg "${filePath}" "${path.join(outputDir, filePrefix)}"`;
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        return reject(error);
      }
      if (stderr) {
        console.log(`Stderr: ${stderr}`);
      }
      resolve('Success');
    });
  });
};

// --- Helper: Cleanup ---
const cleanupFiles = (filesToDelete) => {
  filesToDelete.forEach(file => {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch (e) {
      console.error('Cleanup Error:', e);
    }
  });
};

// --- API Route ---
app.post('/convert', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded');

  const filePath = req.file.path;
  const outputDir = path.join(__dirname, '../output');
  
  // Ensure output folder exists
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  const filePrefix = path.basename(filePath, path.extname(filePath)); 

  try {
    // 1. Convert PDF using our new Helper Function
    await convertPdfToImages(filePath, outputDir, filePrefix);

    // 2. ZIP File create karo
    const zipName = `${filePrefix}.zip`;
    const zipPath = path.join(outputDir, zipName);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      res.download(zipPath, 'converted_images.zip', (err) => {
        if (err) console.error('Download Error:', err);

        // 4. CLEANUP logic
        // pdftoppm images aise banata hai: prefix-1.jpg, prefix-2.jpg
        const allFiles = fs.readdirSync(outputDir);
        const generatedImages = allFiles
            .filter(f => f.startsWith(filePrefix) && f !== zipName)
            .map(f => path.join(outputDir, f));

        const filesToDelete = [filePath, zipPath, ...generatedImages];
        cleanupFiles(filesToDelete);
        console.log('Cleanup done!');
      });
    });

    archive.on('error', (err) => { throw err; });
    archive.pipe(output);

    // 3. Find images and add to ZIP
    const files = fs.readdirSync(outputDir);
    files.forEach(file => {
      // pdftoppm adds dashes automatically (e.g., prefix-1.jpg)
      if (file.startsWith(filePrefix) && (file.endsWith('.jpg') || file.endsWith('.jpeg'))) {
        archive.file(path.join(outputDir, file), { name: file });
      }
    });

    archive.finalize();

  } catch (error) {
    console.error('Processing Error:', error);
    res.status(500).send('Error processing PDF');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});