# 1. Base Image - Node 18 se Node 20 par upgrade kiya (Supabase requirement)
FROM node:20-slim

# 2. Install System Dependencies (pdftoppm ke liye)
RUN apt-get update && apt-get install -y \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# 3. Work Directory
WORKDIR /app

# 4. Env Variables
ENV NODE_ENV=production
# Render automatically PORT assign karta hai, isliye default 10000 rakha hai 
# par aapka code process.env.PORT ko hi use karega
ENV PORT=10000

# 5. Install NPM Dependencies
COPY package*.json ./
# Production dependencies ke liye 'npm ci' zyada stable hota hai
RUN npm install --production

# 6. Copy All Source Code 
COPY . .

# 7. Setup Permission for folders
# Folder create karke sahi ownership dena (Render/Linux best practice)
RUN mkdir -p uploads output && chmod -R 777 uploads output

# 8. Expose Port
EXPOSE 10000

# 9. Start Server
CMD ["node", "src/index.js"]