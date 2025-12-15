# 1. Official Node.js image use karein
FROM node:18-slim

# 2. System updates aur Poppler Utils install karein (Bahut Zaroori)
RUN apt-get update && apt-get install -y poppler-utils

# 3. Work directory set karein
WORKDIR /app

# 4. Dependencies copy aur install karein
COPY package*.json ./
RUN npm install

# 5. Baaki code copy karein
COPY . .

# 6. Uploads aur Output folder create karein (taaki error na aaye)
RUN mkdir -p uploads output

# 7. Port expose karein
EXPOSE 5000

# 8. Server start command
CMD ["node", "src/index.js"]