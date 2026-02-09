/**
 * Image preprocessing for OCR - matches server-side preprocessing
 * Uses Canvas API instead of OpenCV
 */

export async function preprocessImage(imageBlob: Blob): Promise<Blob> {
  // Load image into canvas
  const img = await loadImage(imageBlob);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // Set canvas size
  let width = img.width;
  let height = img.height;

  // Upscale small images for better OCR (match server behavior)
  if (width < 800) {
    const scale = 800 / width;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  canvas.width = width;
  canvas.height = height;

  // Draw image
  ctx.drawImage(img, 0, 0, width, height);

  // Get image data for processing
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Convert to grayscale
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = gray;     // R
    data[i + 1] = gray; // G
    data[i + 2] = gray; // B
    // Alpha stays the same
  }

  // Apply contrast enhancement (simplified CLAHE)
  enhanceContrast(data, width, height);

  // Apply Otsu's thresholding
  applyOtsuThreshold(data);

  // Put processed image back
  ctx.putImageData(imageData, 0, 0);

  // Convert to blob
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob!);
    }, 'image/png');
  });
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

function enhanceContrast(data: Uint8ClampedArray, width: number, height: number) {
  // Calculate histogram
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    histogram[data[i]]++;
  }

  // Calculate cumulative histogram
  const cdf = new Array(256).fill(0);
  cdf[0] = histogram[0];
  for (let i = 1; i < 256; i++) {
    cdf[i] = cdf[i - 1] + histogram[i];
  }

  // Normalize CDF
  const pixels = width * height;
  const cdfMin = cdf.find(v => v > 0) || 0;
  const scale = 255 / (pixels - cdfMin);

  // Apply histogram equalization
  for (let i = 0; i < data.length; i += 4) {
    const newVal = Math.round((cdf[data[i]] - cdfMin) * scale);
    data[i] = Math.max(0, Math.min(255, newVal));
    data[i + 1] = data[i];
    data[i + 2] = data[i];
  }
}

function applyOtsuThreshold(data: Uint8ClampedArray) {
  // Calculate histogram
  const histogram = new Array(256).fill(0);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    histogram[data[i]]++;
    total++;
  }

  // Otsu's method to find optimal threshold
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i];
  }

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let maxVariance = 0;
  let threshold = 0;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;

    wF = total - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];

    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;

    const variance = wB * wF * (mB - mF) * (mB - mF);

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }

  // Apply threshold
  for (let i = 0; i < data.length; i += 4) {
    const val = data[i] > threshold ? 255 : 0;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }
}
