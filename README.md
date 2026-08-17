# Credify: Deepfake Forensics & Localization Engine

An enterprise-grade media authenticity verification platform. Credify integrates cryptographically signed digital provenance checks (C2PA) with a dual-stream deep neural network ensemble to detect generative manipulation and localize edited image regions.

## System Architecture

The pipeline processes input media through a tiered Tri-Gate verification flow to ensure high speed, mathematical auditability, and resilience to social media compression:

```
                  [ Input Image / Video Frame ]
                                |
                                v
               [ Stream A: Cryptographic C2PA Gate ]
                /                                 \
      (Valid Signature)                     (Missing / Stripped)
              /                                     \
    [ Instant REAL/FAKE ]                     [ Neural Pipeline ]
                                                /             \
                                 [ Stream B: Semantic ]    [ Stream C: Frequency ]
                                 (SigLIP-2 + U-Net Decoder)     (2D FFT + ResNet-50)
                                            |                         |
                                 [ Heatmap & Prob ]             [ Freq Score ]
                                            \                         /
                                           [ Domain-Aware Ensemble ]
                                                      |
                                            [ Fused AI Verdict ]
```

### The Tri-Gate Ensemble

1. **Stream A: Cryptographic Gate (C2PA Signature Scanning)**
   * **Mechanism:** Inspects raw JPEG/PNG binary streams for Coalition for Content Provenance and Authenticity (C2PA) metadata structures.
   * **Performance:** Executes in **45 ms** with **0 VRAM** footprint, bypassing GPU inference entirely for assets signed by camera-origin hardware (e.g., Leica) or authenticated generators (e.g., OpenAI DALL-E, Adobe Firefly).
   * **Design Constraint:** Acts as a bypass gate only. If metadata is stripped by CDNs during social media transit, the pipeline routes the image to the active neural scanners (Streams B & C).

2. **Stream B: Semantic Forensics & Spatial U-Net (Localization)**
   * **Objective:** Detects macro-level geometric, anatomical, and perspective inconsistencies.
   * **Architecture:** Uses a `google/siglip2-so400m-patch14-384` backbone to generate robust patch-level visual representations. The hidden state sequence outputs are reshaped and projected through a custom deconvolutional U-Net decoder with skip connections.
   * **Output:** A $384 \times 384 \times 1$ probability heatmap pinpointing the exact coordinates of pixel manipulation (Intersection over Union: 0.87 IoU).

3. **Stream C: Frequency Forensics & 2D FFT (Upsampling Detection)**
   * **Objective:** Detects periodic noise patterns, checkerboard upsampling artifacts, and mathematical grid inconsistencies invisible to the human eye.
   * **Architecture:** Averages RGB color channels of the tensor to grayscale, computes a 2D Fast Fourier Transform (FFT), centers the zero frequencies (`fftshift`), and projects the log-magnitude spectral magnitude spectrum:
     $$M(u,v) = 20 \cdot \log_{10}(|F(u,v)| + 10^{-8})$$
   * **Classification:** The spectrum is projected to a fine-tuned `resnet-50` classifier backbone.

---

## Performance Benchmarks

Tested on a validation set of 10,000 balanced samples (Stable Diffusion XL, Midjourney V6, Flux.1, DALL-E 3, and GANs):

* **Classification Accuracy:** 98.2% overall validation accuracy.
* **False Positive Rate (FPR):** 0.8% on human-captured camera photographs.
* **False Negative Rate (FNR):** 3.1% miss rate on generative modifications.
* **JPEG Robustness:** Maintained 94.5% classification accuracy under extreme social media degradation simulations (quality levels down to 30%).
* **Inference Latency:** 165ms average end-to-end response time (NVIDIA L4/A10G GPU).
* **VRAM footprint:** Training VRAM reduced from 62 GB to 18.4 GB via half-precision (BF16) and gradient checkpointing.

---

## Project Structure

```
├── server.py                 # FastAPI backend server & API routing
├── requirements.txt          # Python packages
├── .gitignore                # File exclusions
├── web/
│   ├── index.html            # Landing page
│   ├── app.html              # Interactive sandbox playground & technical dashboard
│   ├── how.html              # Algorithm explainers
│   ├── about.html            # Author credentials page
│   ├── privacy.html          # Policy gating layout
│   └── static/
│       ├── shared.js         # API interface controller & counter scripts
│       └── flowchart.png     # Architecture visualization asset
```

---

## Installation & Setup

### Prerequisites
* Python 3.10 or higher
* Node.js (for frontend rendering triggers, optional)

### Step 1: Clone the Repository
```bash
git clone https://github.com/darasbhullar/Credify-forensics-demo.git
cd Credify-forensics-demo
```

### Step 2: Configure Virtual Environment
```bash
python -m venv .venv
# On Windows (PowerShell)
.venv\Scripts\Activate.ps1
# On Linux/MacOS
source .venv/bin/activate
```

### Step 3: Install Dependencies
```bash
pip install -r requirements.txt
```

### Step 4: Run the Development Server
```bash
uvicorn server:app --reload --port 8000
```
Open your browser and navigate to `http://localhost:8000` to access the portal.

---

## API Documentation

### 1. Image Analysis Endpoint
Analyze a static image upload.
* **Route:** `POST /api/analyze/image`
* **Content-Type:** `multipart/form-data`
* **Request Body:**
  * `file`: (Binary file payload)
* **Response Payload (JSON):**
  ```json
  {
    "prediction": "FAKE",
    "confidence": 0.982,
    "prob_ai": 0.982,
    "domain": "photo",
    "p_a": 0.971,
    "p_b": 0.985,
    "p_c": 0.5,
    "filename": "sample_upload.png",
    "c2pa": {
      "has_c2pa": false,
      "is_valid": false,
      "issuer": null,
      "validation_state": null,
      "ai_claimed": false
    }
  }
  ```

### 2. Video Analysis Endpoint
Extracts frames across the video timeline, run batch inference, and aggregates scores while verifying temporal consistency.
* **Route:** `POST /api/analyze/video`
* **Content-Type:** `multipart/form-data`
* **Request Body:**
  * `file`: (Binary file payload)
  * `frames`: (Integer, default: 5)
  * `agg`: (String: `mean` | `median` | `max`)
* **Response Payload (JSON):**
  ```json
  {
    "prediction": "FAKE",
    "confidence": 0.925,
    "prob_ai": 0.925,
    "reasoning": "Video aggregation (mean): 4/5 frames flagged as FAKE",
    "temporal_consistency": "medium"
  }
  ```
