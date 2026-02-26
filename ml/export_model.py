"""
One-time export of EfficientNet-B0 (pretrained ImageNet) to ONNX.

Run this once before starting the ML service:
  # Inside the container (Python 3.13 + torch available):
  docker-compose exec ml python export_model.py

  # Or during Docker build (see Dockerfile).

Requires: torch, torchvision, timm  (install via requirements-export.txt)
Output:   MODEL_PATH  (default /opt/shark_model/efficientnet_b0.onnx)
"""

import os
from pathlib import Path

OUTPUT = Path(os.getenv("MODEL_PATH", "/opt/shark_model/efficientnet_b0.onnx"))


def main() -> None:
    import timm
    import torch

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    print(f"Loading EfficientNet-B0 (pretrained=True)…")
    model = timm.create_model("efficientnet_b0", pretrained=True, num_classes=0)
    model.eval()

    dummy = torch.randn(1, 3, 224, 224)
    print(f"Exporting to {OUTPUT}…")
    torch.onnx.export(
        model,
        dummy,
        str(OUTPUT),
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}},
        opset_version=17,
    )
    print(f"Done — {OUTPUT.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
