FROM python:3.13-slim

WORKDIR /app

# System libs required by opencv-python-headless + curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        libglib2.0-0 \
        libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt export_model.py ./
RUN pip install --no-cache-dir --timeout 300 -r requirements.txt

# Export EfficientNet-B0 to ONNX once during build.
RUN python export_model.py

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--reload"]
