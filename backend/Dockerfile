FROM node:18-alpine

# Hugging Face Spaces requires the app to act like a user rather than root.
# Set proper user permissions (optional but recommended for security on HF Docs)
RUN adduser -D user
USER user

WORKDIR /app

# Copy package structures separately for docker layer caching speed
COPY --chown=user package*.json ./
RUN npm ci --only=production

# Copy entire source code to the container
COPY --chown=user . .

# Hugging Face specific requirement: expose & bind the server on 7860
ENV PORT=7860
EXPOSE 7860

# Execute our new `npm start` script automatically
CMD ["npm", "start"]
