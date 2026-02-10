/**
 * Image preprocessing for OCR - matches server-side preprocessing
 * Uses Canvas API instead of OpenCV
 *
 * Workflow B enhancements:
 * - Regional adaptive thresholding
 * - Deskew correction (simple)
 * - Sharpening for blurry captures
 */

export interface RegionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

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

  // Skip Otsu thresholding - it's too aggressive for serif fonts
  // Tesseract works well with high-contrast grayscale
  // applyOtsuThreshold(data);

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

/**
 * Apply sharpening filter to improve blurry captures
 * Uses unsharp mask technique
 */
export function applySharpen(
  imageData: ImageData,
  strength: number = 0.5
): void {
  const { data, width, height } = imageData;
  const original = new Uint8ClampedArray(data);

  // Gaussian blur kernel (3x3)
  const kernel = [
    1/16, 2/16, 1/16,
    2/16, 4/16, 2/16,
    1/16, 2/16, 1/16
  ];

  // Create blurred version
  const blurred = new Uint8ClampedArray(data.length);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;

      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let ki = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const nidx = ((y + ky) * width + (x + kx)) * 4 + c;
            sum += original[nidx] * kernel[ki++];
          }
        }
        blurred[idx + c] = sum;
      }
      blurred[idx + 3] = 255;
    }
  }

  // Unsharp mask: original + strength * (original - blurred)
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const sharp = original[i + c] + strength * (original[i + c] - blurred[i + c]);
      data[i + c] = Math.max(0, Math.min(255, Math.round(sharp)));
    }
  }
}

/**
 * Preprocess with regional focus
 * Applies different processing to price region vs rest
 */
export async function preprocessWithRegions(
  imageBlob: Blob,
  priceRegion?: RegionBounds
): Promise<Blob> {
  const img = await loadImage(imageBlob);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // Set canvas size
  let width = img.width;
  let height = img.height;

  // Upscale small images
  if (width < 800) {
    const scale = 800 / width;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  canvas.width = width;
  canvas.height = height;

  // Draw image
  ctx.drawImage(img, 0, 0, width, height);

  // Get image data
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Convert to grayscale
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }

  // Apply global contrast enhancement
  enhanceContrast(data, width, height);

  // Apply sharpening for slightly blurry captures
  applySharpen(imageData, 0.3);

  // If price region is specified, apply local adaptive thresholding there
  if (priceRegion) {
    applyAdaptiveThreshold(data, width, height, priceRegion);
  }

  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob!);
    }, 'image/png');
  });
}

/**
 * Apply adaptive (local) thresholding to a region
 * Uses mean of surrounding pixels as threshold
 */
function applyAdaptiveThreshold(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  region: RegionBounds
): void {
  const blockSize = 15; // Window size for local mean
  const C = 10; // Constant subtracted from mean

  const startX = Math.max(0, Math.floor(region.x));
  const startY = Math.max(0, Math.floor(region.y));
  const endX = Math.min(width, Math.floor(region.x + region.width));
  const endY = Math.min(height, Math.floor(region.y + region.height));

  // Create integral image for fast mean calculation
  const integral = new Float64Array((width + 1) * (height + 1));

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += data[(y * width + x) * 4];
      integral[(y + 1) * (width + 1) + (x + 1)] =
        integral[y * (width + 1) + (x + 1)] + rowSum;
    }
  }

  // Apply adaptive threshold in region
  const half = Math.floor(blockSize / 2);

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      // Calculate local mean using integral image
      const x1 = Math.max(0, x - half);
      const y1 = Math.max(0, y - half);
      const x2 = Math.min(width - 1, x + half);
      const y2 = Math.min(height - 1, y + half);

      const area = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum =
        integral[(y2 + 1) * (width + 1) + (x2 + 1)] -
        integral[y1 * (width + 1) + (x2 + 1)] -
        integral[(y2 + 1) * (width + 1) + x1] +
        integral[y1 * (width + 1) + x1];

      const mean = sum / area;
      const idx = (y * width + x) * 4;
      const pixel = data[idx];

      // Binarize based on local mean
      const val = pixel > mean - C ? 255 : 0;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
    }
  }
}
