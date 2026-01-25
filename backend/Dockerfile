# RyteAI Backend Dockerfile
# Optimized for Render.com deployment with layer caching

FROM python:3.14-slim

WORKDIR /app

# Install system dependencies for building Python packages
# python-jose[cryptography] requires build tools to compile C extensions
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first (cached layer)
# This layer only rebuilds when requirements.txt changes
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose the FastAPI port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
