FROM python:3.11-slim

WORKDIR /app

# curl is only for the healthcheck; every dependency ships prebuilt wheels,
# so no compilers are needed (keeps the image small and builds fast)
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (Docker layer caching — faster rebuilds)
COPY requirements.txt .

# Install Python deps
RUN pip install --no-cache-dir --timeout 300 --upgrade pip && \
    pip install --no-cache-dir --timeout 300 -r requirements.txt

# Pre-cache the tiktoken vocabulary at build time (otherwise first use downloads it at runtime)
ENV TIKTOKEN_CACHE_DIR=/app/.tiktoken
RUN python -c "import tiktoken; tiktoken.get_encoding('cl100k_base')"

# Copy entire project
COPY . .

# Temp dir for PDF uploads
RUN mkdir -p /tmp/policydecoder_uploads

# Expose port
ENV PORT=7860
EXPOSE 7860

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -fs http://localhost:${PORT}/ || exit 1

# Start FastAPI server
# One image, two roles. API (default) runs the embedded ingest worker too; for a
# dedicated worker service override the command with:  python -m rag_engine.worker
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT} --timeout-keep-alive 75"]
