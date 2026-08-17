/**
 * Credify Shared JavaScript
 * =========================
 * 
 * This file contains all the core functionality for the Credify media authenticity platform.
 * 
 * PRESERVED FUNCTIONALITY (DO NOT MODIFY):
 * - API endpoints: /api/analyze/image, /api/analyze/video
 * - Request/response formats
 * - File upload handling
 * - Result rendering logic
 * - Theme toggling
 * 
 * All existing buttons, forms, API calls, and response handling remain functional.
 * This is a frontend redesign only - backend logic is unchanged.
 */

//////////////////////////
// Theme Handling
//////////////////////////
const CredifyTheme = {
  key: "credify-theme",

  getPreferred() {
    const stored = window.localStorage.getItem(this.key);
    if (stored === "light" || stored === "dark") return stored;
    return "dark";
  },

  apply(theme) {
    const root = document.documentElement;
    root.dataset.theme = theme;
  },

  init() {
    this.apply(this.getPreferred());
  },

  toggle() {
    const current = this.getPreferred();
    const next = current === "dark" ? "light" : "dark";
    window.localStorage.setItem(this.key, next);
    this.apply(next);
  }
};

window.CredifyTheme = CredifyTheme;


//////////////////////////
// Utility Functions
//////////////////////////

/**
 * Format a number as a percentage string
 * @param {number} x - Number to format (0-1)
 * @returns {string} Formatted percentage
 */
function formatPct(x) {
  if (typeof x !== "number" || Number.isNaN(x)) return "—";
  return (x * 100).toFixed(1) + "%";
}

/**
 * Animate a percentage value from 0 to target
 * @param {HTMLElement} el - Element to update
 * @param {number} targetVal - Target probability value (0 to 1)
 */
function animatePct(el, targetVal) {
  if (!el) return;
  if (typeof targetVal !== "number" || Number.isNaN(targetVal)) {
    el.textContent = "—";
    return;
  }
  const targetPct = targetVal * 100;
  const duration = 1000; // ms
  const startVal = 0;
  let startTimestamp = null;

  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    // Smooth easeOutQuad progress
    const easeProgress = progress * (2 - progress);
    const currentVal = easeProgress * (targetPct - startVal) + startVal;
    
    el.textContent = currentVal.toFixed(1) + "% AI";
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
}

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


//////////////////////////
// Main App Logic
//////////////////////////
const CredifyApp = {
  // State
  imageFile: null,
  videoFile: null,
  mode: "image",
  geek: false,
  robust: false,
  lastImageResult: null,
  lastVideoResult: null,

  /**
   * Initialize the application
   */
  init() {
    this.initImage();
    this.initVideo();
  },

  ////////////////////////
  // Mode Switching
  ////////////////////////

  /**
   * Switch between image and video analysis modes
   * @param {string} mode - 'image' or 'video'
   */
  setMode(mode) {
    this.mode = mode === "video" ? "video" : "image";

    const imageSection = document.getElementById("image-section");
    const videoSection = document.getElementById("video-section");
    
    if (imageSection && videoSection) {
      if (this.mode === "image") {
        imageSection.classList.remove("hidden");
        videoSection.classList.add("hidden");
        // Animate transition
        gsap.fromTo(imageSection, 
          { opacity: 0, y: 20 }, 
          { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }
        );
      } else {
        videoSection.classList.remove("hidden");
        imageSection.classList.add("hidden");
        // Animate transition
        gsap.fromTo(videoSection, 
          { opacity: 0, y: 20 }, 
          { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }
        );
      }
    }

    // Update mode buttons
    const tabs = document.querySelectorAll(".mode-btn");
    tabs.forEach((btn) => {
      const m = btn.getAttribute("data-mode");
      if (m === this.mode) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    // Update geek panel visibility
    if (this.mode === "image") {
      this.renderImageGeek(this.lastImageResult);
    } else {
      this.renderVideoGeek(this.lastVideoResult);
    }
  },

  ////////////////////////
  // Toggle Controls
  ////////////////////////

  /**
   * Toggle geek mode (detailed technical output)
   */
  toggleGeek() {
    this.geek = !this.geek;
    const btn = document.getElementById("geek-toggle");
    if (btn) {
      btn.classList.toggle("active", this.geek);
    }

    if (this.mode === "image") {
      this.renderImageGeek(this.lastImageResult);
    } else {
      this.renderVideoGeek(this.lastVideoResult);
    }
  },

  /**
   * Toggle robust mode (stricter thresholds)
   */
  toggleRobust() {
    this.robust = !this.robust;
    const btn = document.getElementById("robust-toggle");
    if (btn) {
      btn.classList.toggle("active", this.robust);
    }

    if (this.lastImageResult) this.renderImageVerdict(this.lastImageResult);
    if (this.lastVideoResult) this.renderVideoVerdict(this.lastVideoResult);
  },

  /**
   * Interpret results with robust mode thresholds
   * @param {Object} result - Analysis result
   * @returns {Object} Interpreted verdict
   */
  interpretRobust(result) {
    if (!this.robust || !result) {
      return {
        label: result ? result.label : "UNKNOWN",
        confidence: result ? result.confidence : null,
        note: ""
      };
    }

    const p = typeof result.prob_ai === "number" ? result.prob_ai : 0.5;

    if (p >= 0.8) {
      return {
        label: "FAKE",
        confidence: p,
        note: "Robust mode: very strong AI signal."
      };
    }
    if (p <= 0.2) {
      return {
        label: "REAL",
        confidence: 1 - p,
        note: "Robust mode: very strong real signal."
      };
    }
    return {
      label: "Inconclusive",
      confidence: null,
      note: "Robust mode: borderline case, keep for review."
    };
  },

  ////////////////////////
  // Image Analysis
  ////////////////////////

  /**
   * Initialize image upload and analysis handlers
   */
  initImage() {
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("file-input");
    const analyzeBtn = document.getElementById("analyze-btn");
    const statusText = document.getElementById("status-text");
    const previewWrapper = document.getElementById("preview-wrapper");
    const previewImg = document.getElementById("preview-img");

    if (!dropzone || !fileInput || !analyzeBtn) return;

    const setStatus = (text, mode = "idle") => {
      if (statusText) statusText.textContent = text;
      analyzeBtn.disabled = mode === "loading";
    };

    const setFile = (file) => {
      this.imageFile = file;
      if (!file) {
        if (previewWrapper) previewWrapper.classList.add("hidden");
        setStatus("Waiting for an image...");
        return;
      }
      const url = URL.createObjectURL(file);
      if (previewImg) previewImg.src = url;
      if (previewWrapper) {
        previewWrapper.classList.remove("hidden");
        // Animate preview appearance
        gsap.fromTo(previewWrapper,
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
        );
      }
      setStatus("Ready to analyze.");
    };

    // Click to browse
    dropzone.addEventListener("click", () => fileInput.click());
    
    // Drag and drop
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    });
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      const file = e.dataTransfer.files[0];
      if (file) setFile(file);
    });

    // File input change
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) setFile(file);
    });

    // Analyze button
    analyzeBtn.addEventListener("click", async () => {
      if (!this.imageFile) {
        setStatus("Please select an image first.");
        return;
      }
      await this.analyzeImage(setStatus);
    });
  },

  /**
   * Send image to API for analysis
   * @param {Function} setStatus - Status callback
   */
  async analyzeImage(setStatus) {
    const file = this.imageFile;
    if (!file) return;

    const wrapper = document.getElementById("preview-wrapper");
    let laser = null;

    try {
      setStatus("Analyzing image...", "loading");

      // Inject scanning laser visual
      if (wrapper) {
        laser = document.createElement("div");
        laser.className = "scan-laser";
        wrapper.appendChild(laser);
      }

      const formData = new FormData();
      formData.append("file", file);

      // PRESERVED: API endpoint and request format
      const resp = await fetch("/api/analyze/image", {
        method: "POST",
        body: formData
      });

      if (!resp.ok) {
        const payload = await resp.json().catch(() => ({}));
        throw new Error(payload.detail || "Server error");
      }

      // PRESERVED: Response parsing
      const data = await resp.json();
      this.lastImageResult = data;

      this.renderImageVerdict(data);
      this.renderImageBreakdown(data);
      this.renderImageGeek(data);

      setStatus("Analysis complete.");
    } catch (err) {
      console.error(err);
      setStatus("Something went wrong. Check the logs.");
      this.renderImageError(err);
    } finally {
      if (laser && wrapper && wrapper.contains(laser)) {
        wrapper.removeChild(laser);
      }
    }
  },

  /**
   * Render image analysis verdict
   * @param {Object} data - Analysis result
   */
  renderImageVerdict(data) {
    if (!data) return;

    const resultLabel = document.getElementById("result-label");
    const resultMain = document.getElementById("result-main");
    const resultSub = document.getElementById("result-sub");
    const resultCard = document.getElementById("result-card");

    const baseLabel = data.label || "UNKNOWN";
    const baseConf = typeof data.confidence === "number" ? data.confidence : 0;
    const interp = this.interpretRobust(data);

    // Update card styling
    if (resultCard) {
      resultCard.classList.remove("real", "fake");
      if (baseLabel === "FAKE") resultCard.classList.add("fake");
      else if (baseLabel === "REAL") resultCard.classList.add("real");
    }

    // Update verdict text
    if (resultMain) {
      resultMain.classList.remove("real", "fake");
      
      if (this.robust && interp.label === "Inconclusive") {
        resultMain.textContent = "Inconclusive in Robust mode.";
      } else {
        const shownLabel = this.robust ? interp.label : baseLabel;
        const shownConf = this.robust && interp.confidence != null ? interp.confidence : baseConf;
        
        if (shownLabel === "FAKE") {
          resultMain.textContent = `Likely AI-generated (${formatPct(shownConf)} confidence)`;
          resultMain.classList.add("fake");
        } else if (shownLabel === "REAL") {
          resultMain.textContent = `Likely authentic (${formatPct(shownConf)} confidence)`;
          resultMain.classList.add("real");
        } else {
          resultMain.textContent = `${shownLabel} (${formatPct(shownConf || 0)} confidence)`;
        }
      }
    }

    // Update subtitle
    if (resultSub) {
      if (interp.note) {
        resultSub.textContent = interp.note;
      } else {
        resultSub.textContent = "Verdict uses the fused AI probability from both models plus Content Credentials when present.";
      }
    }
  },

  /**
   * Render image score breakdown
   * @param {Object} data - Analysis result
   */
  renderImageBreakdown(data) {
    if (!data) return;

    const scoreA = document.getElementById("score-a");
    const scoreB = document.getElementById("score-b");
    const scoreC = document.getElementById("score-c");
    const scoreFinal = document.getElementById("score-final");
    const resultFilename = document.getElementById("result-filename");
    const c2paLine = document.getElementById("c2pa-line");

    const pA = typeof data.p_a === "number" ? data.p_a : null;
    const pB = typeof data.p_b === "number" ? data.p_b : null;
    const pC = typeof data.p_c === "number" ? data.p_c : null;
    const pFinal = typeof data.prob_ai === "number" ? data.prob_ai : 0;

    animatePct(scoreA, pA);
    animatePct(scoreB, pB);
    animatePct(scoreC, pC);
    animatePct(scoreFinal, pFinal);

    if (resultFilename) resultFilename.textContent = data.filename || "";

    // C2PA info
    const c2pa = data.c2pa || {};
    if (c2paLine) {
      let text = "C2PA: No Content Credentials found.";
      if (c2pa && c2pa.has_c2pa) {
        const state = c2pa.validation_state || "unknown state";
        const issuer = c2pa.issuer || "unknown issuer";
        if (c2pa.ai_claimed && c2pa.is_valid) {
          text = `C2PA: Valid generative AI claim (issuer: ${issuer}, state: ${state}).`;
        } else if (c2pa.is_valid) {
          text = `C2PA: Valid manifest (issuer: ${issuer}, state: ${state}), no explicit AI claim.`;
        } else {
          text = `C2PA: Present but not fully valid (state: ${state}).`;
        }
      }
      c2paLine.textContent = text;
    }
  },

  /**
   * Render geek mode panel for images
   * @param {Object} data - Analysis result
   */
  renderImageGeek(data) {
    const panel = document.getElementById("image-geek-panel");
    const content = document.getElementById("image-geek-content");
    
    if (!panel || !content) return;

    if (!this.geek || !data) {
      panel.classList.add("hidden");
      content.innerHTML = "";
      return;
    }

    const pA = typeof data.p_a === "number" ? data.p_a : 0;
    const pB = typeof data.p_b === "number" ? data.p_b : 0;
    const pC = typeof data.p_c === "number" ? data.p_c : 0;
    const pFinal = typeof data.prob_ai === "number" ? data.prob_ai : 0;
    const baseLabel = data.label || "UNKNOWN";
    const filename = data.filename || "";
    const c2pa = data.c2pa || {};

    let c2paDetail = "No Content Credentials detected.";
    if (c2pa && c2pa.has_c2pa) {
      const state = escapeHtml(c2pa.validation_state || "unknown state");
      const issuer = escapeHtml(c2pa.issuer || "unknown issuer");
      if (c2pa.ai_claimed && c2pa.is_valid) {
        c2paDetail = `Valid generative AI manifest (issuer: ${issuer}, state: ${state}).`;
      } else if (c2pa.is_valid) {
        c2paDetail = `Valid manifest (issuer: ${issuer}, state: ${state}), no explicit AI claim.`;
      } else {
        c2paDetail = `Manifest present but not fully valid (state: ${state}).`;
      }
    }

    panel.classList.remove("hidden");
    content.innerHTML = `
      <div class="geek-section">
        <h4>Raw Model Scores</h4>
        <div class="geek-row">
          <span class="geek-key">Model A (texture)</span>
          <span class="geek-value">${formatPct(pA)} AI</span>
        </div>
        <div class="geek-row">
          <span class="geek-key">Model B (semantic)</span>
          <span class="geek-value">${formatPct(pB)} AI</span>
        </div>
        <div class="geek-row">
          <span class="geek-key">Model C (calibration)</span>
          <span class="geek-value">${formatPct(pC)} AI</span>
        </div>
        <div class="geek-row">
          <span class="geek-key">Fused probability</span>
          <span class="geek-value">${formatPct(pFinal)} AI</span>
        </div>
        <div class="geek-row">
          <span class="geek-key">Base label</span>
          <span class="geek-value">${escapeHtml(baseLabel)}</span>
        </div>
      </div>
      <div class="geek-section">
        <h4>Thresholds & Logic</h4>
        <div class="geek-row">
          <span class="geek-key">≥ 50% fused</span>
          <span class="geek-value">→ FAKE</span>
        </div>
        <div class="geek-row">
          <span class="geek-key">&lt; 50% fused</span>
          <span class="geek-value">→ REAL</span>
        </div>
        <div class="geek-row">
          <span class="geek-key">Robust mode</span>
          <span class="geek-value">&lt;20% → strong REAL</span>
        </div>
        <div class="geek-row">
          <span class="geek-key">Robust mode</span>
          <span class="geek-value">&gt;80% → strong FAKE</span>
        </div>
      </div>
      <div class="geek-section" style="grid-column: 1 / -1;">
        <h4>Metadata</h4>
        <div class="geek-row">
          <span class="geek-key">Filename</span>
          <span class="geek-value">${escapeHtml(filename)}</span>
        </div>
        <div class="geek-row">
          <span class="geek-key">Content Credentials</span>
          <span class="geek-value">${c2paDetail}</span>
        </div>
      </div>
    `;
  },

  /**
   * Render error state for image analysis
   * @param {Error} err - Error object
   */
  renderImageError(err) {
    const resultMain = document.getElementById("result-main");
    const resultSub = document.getElementById("result-sub");
    const c2paLine = document.getElementById("c2pa-line");

    if (resultMain) resultMain.textContent = "We couldn't analyze this image.";
    if (resultSub) resultSub.textContent = String(err.message || "Internal server error.");
    if (c2paLine) c2paLine.textContent = "C2PA: Not available due to an error.";
  },

  ////////////////////////
  // Video Analysis
  ////////////////////////

  /**
   * Initialize video upload and analysis handlers
   */
  initVideo() {
    const dropzone = document.getElementById("video-dropzone");
    const fileInput = document.getElementById("video-input");
    const analyzeBtn = document.getElementById("video-analyze-btn");
    const statusText = document.getElementById("video-status-text");
    const framesSelect = document.getElementById("frames-select");
    const aggSelect = document.getElementById("agg-select");

    if (!dropzone || !fileInput || !analyzeBtn) return;

    const setStatus = (text, mode = "idle") => {
      if (statusText) statusText.textContent = text;
      analyzeBtn.disabled = mode === "loading";
    };

    const setFile = (file) => {
      this.videoFile = file;
      if (!file) {
        setStatus("Waiting for a video...");
        return;
      }
      setStatus("Ready to analyze.");
    };

    // Click to browse
    dropzone.addEventListener("click", () => fileInput.click());
    
    // Drag and drop
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    });
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      const file = e.dataTransfer.files[0];
      if (file) setFile(file);
    });

    // File input change
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) setFile(file);
    });

    // Analyze button
    analyzeBtn.addEventListener("click", async () => {
      if (!this.videoFile) {
        setStatus("Please select a video first.");
        return;
      }
      const frames = framesSelect ? framesSelect.value || "5" : "5";
      const agg = aggSelect ? aggSelect.value || "mean" : "mean";
      await this.analyzeVideo(setStatus, frames, agg);
    });
  },

  /**
   * Send video to API for analysis
   * @param {Function} setStatus - Status callback
   * @param {string} frames - Number of frames to sample
   * @param {string} agg - Aggregation method
   */
  async analyzeVideo(setStatus, frames, agg) {
    const file = this.videoFile;
    if (!file) return;

    try {
      setStatus("Analyzing video...", "loading");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("frames", String(frames));
      formData.append("agg", String(agg));

      // PRESERVED: API endpoint and request format
      const resp = await fetch("/api/analyze/video", {
        method: "POST",
        body: formData
      });

      if (!resp.ok) {
        const payload = await resp.json().catch(() => ({}));
        throw new Error(payload.detail || "Server error");
      }

      // PRESERVED: Response parsing
      const data = await resp.json();
      this.lastVideoResult = data;

      this.renderVideoVerdict(data);
      this.renderVideoBreakdown(data);
      this.renderVideoGeek(data);

      setStatus("Analysis complete.");
    } catch (err) {
      console.error(err);
      setStatus("Something went wrong. Check the logs.");
      this.renderVideoError(err);
    }
  },

  /**
   * Render video analysis verdict
   * @param {Object} data - Analysis result
   */
  renderVideoVerdict(data) {
    if (!data) return;

    const resultCard = document.getElementById("video-result-card");
    const main = document.getElementById("video-result-main");
    const sub = document.getElementById("video-result-sub");
    const metaLine = document.getElementById("video-meta-line");

    const baseLabel = data.label || "UNKNOWN";
    const baseConf = typeof data.confidence === "number" ? data.confidence : 0;
    const interp = this.interpretRobust(data);

    // Update card styling
    if (resultCard) {
      resultCard.classList.remove("real", "fake");
      if (baseLabel === "FAKE") resultCard.classList.add("fake");
      else if (baseLabel === "REAL") resultCard.classList.add("real");
    }

    // Update main verdict
    if (main) {
      main.classList.remove("real", "fake");
      
      if (this.robust && interp.label === "Inconclusive") {
        main.textContent = "Inconclusive in Robust mode.";
      } else {
        const shownLabel = this.robust ? interp.label : baseLabel;
        const shownConf = this.robust && interp.confidence != null ? interp.confidence : baseConf;
        
        if (shownLabel === "FAKE") {
          main.textContent = `Likely AI-generated (${formatPct(shownConf)} confidence)`;
          main.classList.add("fake");
        } else if (shownLabel === "REAL") {
          main.textContent = `Likely authentic (${formatPct(shownConf)} confidence)`;
          main.classList.add("real");
        } else {
          main.textContent = `${shownLabel} (${formatPct(shownConf || 0)} confidence)`;
        }
      }
    }

    // Update subtitle
    if (sub) {
      const pFinal = typeof data.prob_ai === "number" ? data.prob_ai : 0;
      const aggUsed = data.agg || "mean";
      sub.textContent = `Aggregated AI probability: ${formatPct(pFinal)} (aggregation: ${aggUsed}).` +
        (this.robust && interp.note ? ` ${interp.note}` : "");
    }

    // Update meta line
    if (metaLine) {
      const framesOk = data.frames_ok ?? 0;
      const framesTotal = data.frames_total ?? 0;
      const fps = data.fps ?? 0;
      metaLine.textContent = `Sampled ${framesTotal} frames (${framesOk} successful) at ~${fps.toFixed(1)} fps.`;
    }
  },

  /**
   * Render video score breakdown
   * @param {Object} data - Analysis result
   */
  renderVideoBreakdown(data) {
    const c2paLine = document.getElementById("video-c2pa-line");
    const c2pa = data.c2pa || {};

    if (c2paLine) {
      let text = "C2PA: No Content Credentials found.";
      if (c2pa && c2pa.has_c2pa) {
        const state = c2pa.validation_state || "unknown state";
        const issuer = c2pa.issuer || "unknown issuer";
        if (c2pa.ai_claimed && c2pa.is_valid) {
          text = `C2PA: Valid generative AI claim (issuer: ${issuer}, state: ${state}).`;
        } else if (c2pa.is_valid) {
          text = `C2PA: Valid manifest (issuer: ${issuer}, state: ${state}), no explicit AI claim.`;
        } else {
          text = `C2PA: Present but not fully valid (state: ${state}).`;
        }
      }
      c2paLine.textContent = text;
    }
  },

  /**
   * Render geek mode panel for videos
   * @param {Object} data - Analysis result
   */
  renderVideoGeek(data) {
    const panel = document.getElementById("video-geek-panel");
    const content = document.getElementById("video-geek-content");
    
    if (!panel || !content) return;

    if (!this.geek || !data) {
      panel.classList.add("hidden");
      content.innerHTML = "";
      return;
    }

    const pFinal = typeof data.prob_ai === "number" ? data.prob_ai : 0;
    const aggUsed = data.agg || "mean";
    const fps = data.fps ?? 0;
    const framesOk = data.frames_ok ?? 0;
    const framesTotal = data.frames_total ?? 0;
    const baseLabel = data.label || "UNKNOWN";
    const filename = data.filename || "";
    const c2pa = data.c2pa || {};

    let c2paDetail = "No Content Credentials detected.";
    if (c2pa && c2pa.has_c2pa) {
      const state = escapeHtml(c2pa.validation_state || "unknown state");
      const issuer = escapeHtml(c2pa.issuer || "unknown issuer");
      if (c2pa.ai_claimed && c2pa.is_valid) {
        c2paDetail = `Valid generative AI manifest (issuer: ${issuer}, state: ${state}).`;
      } else if (c2pa.is_valid) {
        c2paDetail = `Valid manifest (issuer: ${issuer}, state: ${state}), no explicit AI claim.`;
      } else {
        c2paDetail = `Manifest present but not fully valid (state: ${state}).`;
      }
    }

    panel.classList.remove("hidden");
    content.innerHTML = `
      <div class="geek-section">
        <h4>Aggregate Signal</h4>
        <div class="geek-row">
          <span class="geek-key">Fused AI probability</span>
          <span class="geek-value">${formatPct(pFinal)}</span>
        </div>
        <div class="geek-row">
          <span class="geek-key">Base label</span>
          <span class="geek-value">${escapeHtml(baseLabel)}</span>
        </div>
        <div class="geek-row">
          <span class="geek-key">Aggregation</span>
          <span class="geek-value">${escapeHtml(aggUsed)}</span>
        </div>
      </div>
      <div class="geek-section">
        <h4>Sampling & Timing</h4>
        <div class="geek-row">
          <span class="geek-key">Frames sampled</span>
          <span class="geek-value">${framesTotal}</span>
        </div>
        <div class="geek-row">
          <span class="geek-key">Successful frames</span>
          <span class="geek-value">${framesOk}</span>
        </div>
        <div class="geek-row">
          <span class="geek-key">Approx. FPS</span>
          <span class="geek-value">${fps.toFixed(1)}</span>
        </div>
        <div class="geek-row">
          <span class="geek-key">Robust thresholds</span>
          <span class="geek-value">&lt;20% REAL, &gt;80% FAKE</span>
        </div>
      </div>
      <div class="geek-section" style="grid-column: 1 / -1;">
        <h4>Metadata</h4>
        <div class="geek-row">
          <span class="geek-key">Filename</span>
          <span class="geek-value">${escapeHtml(filename)}</span>
        </div>
        <div class="geek-row">
          <span class="geek-key">Content Credentials</span>
          <span class="geek-value">${c2paDetail}</span>
        </div>
      </div>
    `;
  },

  /**
   * Render error state for video analysis
   * @param {Error} err - Error object
   */
  renderVideoError(err) {
    const main = document.getElementById("video-result-main");
    const sub = document.getElementById("video-result-sub");
    const metaLine = document.getElementById("video-meta-line");
    const c2paLine = document.getElementById("video-c2pa-line");

    if (main) main.textContent = "We couldn't analyze this video.";
    if (sub) sub.textContent = String(err.message || "Internal server error.");
    if (metaLine) metaLine.textContent = "";
    if (c2paLine) c2paLine.textContent = "C2PA: Not available due to an error.";
  },

  /**
   * Run pre-computed analysis on one of the curated demo sample images
   * @param {string} sampleId - The ID of the sample to run
   */
  async runSample(sampleId) {
    const statusText = document.getElementById("status-text");
    const analyzeBtn = document.getElementById("analyze-btn");
    const previewWrapper = document.getElementById("preview-wrapper");
    const previewImg = document.getElementById("preview-img");

    const setStatus = (text, mode = "idle") => {
      if (statusText) statusText.textContent = text;
      if (analyzeBtn) analyzeBtn.disabled = mode === "loading";
    };

    let laser = null;

    try {
      setStatus("Loading sample data...", "loading");

      // Define placeholder images to display in the UI preview zone
      const sampleImages = {
        'sample_real': 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600',
        'sample_fake': 'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=600',
        'sample_c2pa_real': 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600',
        'sample_c2pa_fake': 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600'
      };

      // Set frontend preview image
      if (previewImg) {
        previewImg.src = sampleImages[sampleId];
      }
      if (previewWrapper) {
        previewWrapper.classList.remove("hidden");
        // Inject scanning laser visual
        laser = document.createElement("div");
        laser.className = "scan-laser";
        previewWrapper.appendChild(laser);
      }

      // Fetch pre-computed mock response from backend
      const resp = await fetch("/api/analyze/sample", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ sample_id: sampleId })
      });

      if (!resp.ok) {
        throw new Error("Failed to retrieve sample result");
      }

      const data = await resp.json();
      this.lastImageResult = data;

      // Update UI panels with pre-computed data
      this.renderImageVerdict(data);
      this.renderImageBreakdown(data);
      this.renderImageGeek(data);

      setStatus("Sample analysis complete.");
    } catch (err) {
      console.error(err);
      setStatus("Error loading sample.");
      this.renderImageError(err);
    } finally {
      if (laser && previewWrapper && previewWrapper.contains(laser)) {
        previewWrapper.removeChild(laser);
      }
    }
  }
};

window.CredifyApp = CredifyApp;
