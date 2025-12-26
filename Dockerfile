# 1. Base Image
FROM node:18-slim

# 2. Install System Dependencies (pdftoppm ke liye)
RUN apt-get update && apt-get install -y \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# 3. Work Directory
WORKDIR /app

# 4. Env Variables
ENV NODE_ENV=production
ENV PORT=5000

# 5. Install NPM Dependencies
COPY package*.json ./
# modular structure ke liye saari production dependencies chahiye
RUN npm install --only=production

# 6. Copy All Source Code 
# Ye src/, uploads/, aur config/ saare folders copy kar lega
COPY . .

# 7. Setup Permission for folders
RUN mkdir -p uploads output && chmod 777 uploads output

# 8. Expose Port
EXPOSE 5000

# 9. Start Server
# Humne main file src/index.js rakhi hai, toh ye sahi hai
CMD ["node", "src/index.js"]