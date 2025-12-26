# 📄 PDF to Image Converter API Documentation

This API allows you to upload a PDF file and instantly receive a ZIP file containing high-quality JPEG images of every page. It is deployed on a cloud server and supports multi-page processing

Base URL: https://pdf-converter-api-1eeh.onrender.com

Status: 🟢 Live

🛠️ Tech Stack
Core: Node.js & Express.js

Engine: Poppler Utils (Native pdftoppm for high-performance conversion)

Infrastructure: Docker container deployed on Render

Utilities: Multer (Uploads), Archiver (Zip Compression)

⚡ API Endpoint
1. Convert PDF to Images
Upload a PDF file to convert it into images.

URL: /convert

Method: POST

Content-Type: multipart/form-data

key = file
type = file

📥 Request BodyKeyTypeDescriptionRequiredfileFileThe PDF file you want to convert.✅ Yes