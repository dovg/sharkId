FROM python:3.13-slim

WORKDIR /app

# System libs required by opencv-python-headless + curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        libglib2.0-0 \
        libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-export.txt export_model.py ./
RUN pip install --no-cache-dir --timeout 120 -r requirements.txt

# Export EfficientNet-B0 to ONNX once during build.
# torch/timm are only needed here; they are uninstalled afterwards to
# keep the final image lean.
RUN pip install --no-cache-dir --timeout 300 \
        -r requirements-export.txt \
        --index-url https://download.pytorch.org/whl/cpu \
    && python export_model.py \
    && pip uninstall -y torch torchvision timm

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--reload"]
