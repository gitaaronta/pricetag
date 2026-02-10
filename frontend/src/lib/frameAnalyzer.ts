/**
 * Frame Analyzer for Smart Camera
 *
 * Provides:
 * - Blur detection via Laplacian variance
 * - Edge detection for tag boundaries
 * - Rectangle/contour detection for price tag ROI
 * - Frame stability tracking
 */

export interface FrameAnalysis {
  blurScore: number;           // 0-1, higher = sharper
  isSharp: boolean;            // meets threshold
  tagDetected: boolean;        // found rectangular region
  tagBounds: TagBounds | null; // bounding box if detected
  stability: number;           // 0-1, how stable the frame is
  timestamp: number;
}

export interface TagBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

interface Point {
  x: number;
  y: number;
}

// Configuration - lowered for shaky hands accessibility
const BLUR_THRESHOLD = 0.15;        // minimum blur score (lowered from 0.35)
const STABILITY_THRESHOLD = 0.50;   // minimum stability (lowered from 0.85)
const MIN_TAG_AREA_RATIO = 0.03;    // minimum tag area as ratio of frame
const MAX_TAG_AREA_RATIO = 0.90;    // maximum tag area as ratio of frame
const ASPECT_RATIO_MIN = 1.0;       // minimum width/height ratio for tag
const ASPECT_RATIO_MAX = 4.0;       // maximum width/height ratio for tag

// Rolling buffer for stability detection
const STABILITY_BUFFER_SIZE = 3;    // reduced from 5 for faster response
let stabilityBuffer: TagBounds[] = [];

// Frame buffer for "best frame" selection
const FRAME_BUFFER_SIZE = 10;

export interface BufferedFrame {
  imageData: ImageData;
  analysis: FrameAnalysis;
  canvas: HTMLCanvasElement;
}

let frameBuffer: BufferedFrame[] = [];

/**
 * Analyze a video frame for blur, tag detection, and stability
 */
export function analyzeFrame(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D
): FrameAnalysis {
  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);

  // Convert to grayscale for analysis
  const grayscale = toGrayscale(imageData);

  // Calculate blur score using Laplacian variance
  const blurScore = calculateBlurScore(grayscale, width, height);
  const isSharp = blurScore >= BLUR_THRESHOLD;

  // Detect edges
  const edges = detectEdges(grayscale, width, height);

  // Find rectangular contours (potential price tags)
  const tagBounds = findTagBounds(edges, width, height);
  const tagDetected = tagBounds !== null;

  // Calculate stability based on tag position consistency
  const stability = calculateStability(tagBounds);

  return {
    blurScore,
    isSharp,
    tagDetected,
    tagBounds,
    stability,
    timestamp: Date.now(),
  };
}

/**
 * Convert ImageData to grayscale array
 */
function toGrayscale(imageData: ImageData): Uint8Array {
  const { data, width, height } = imageData;
  const grayscale = new Uint8Array(width * height);

  for (let i = 0; i < grayscale.length; i++) {
    const idx = i * 4;
    // Luminance formula
    grayscale[i] = Math.round(
      0.299 * data[idx] +
      0.587 * data[idx + 1] +
      0.114 * data[idx + 2]
    );
  }

  return grayscale;
}

/**
 * Calculate blur score using Laplacian variance
 * Higher variance = sharper image
 */
function calculateBlurScore(
  grayscale: Uint8Array,
  width: number,
  height: number
): number {
  // Laplacian kernel: [0, 1, 0], [1, -4, 1], [0, 1, 0]
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;

      // Apply Laplacian kernel
      const laplacian =
        -4 * grayscale[idx] +
        grayscale[idx - 1] +          // left
        grayscale[idx + 1] +          // right
        grayscale[idx - width] +      // top
        grayscale[idx + width];       // bottom

      sum += laplacian;
      sumSq += laplacian * laplacian;
      count++;
    }
  }

  // Calculate variance
  const mean = sum / count;
  const variance = (sumSq / count) - (mean * mean);

  // Normalize to 0-1 range (typical variance range is 0-2000+)
  // Sharp images typically have variance > 500
  const normalized = Math.min(1, Math.sqrt(variance) / 50);

  return normalized;
}

/**
 * Detect edges using Sobel operator
 */
function detectEdges(
  grayscale: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const edges = new Uint8Array(width * height);

  // Sobel kernels
  // Gx: [-1, 0, 1], [-2, 0, 2], [-1, 0, 1]
  // Gy: [-1, -2, -1], [0, 0, 0], [1, 2, 1]

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;

      // Get neighboring pixels
      const tl = grayscale[idx - width - 1];
      const t  = grayscale[idx - width];
      const tr = grayscale[idx - width + 1];
      const l  = grayscale[idx - 1];
      const r  = grayscale[idx + 1];
      const bl = grayscale[idx + width - 1];
      const b  = grayscale[idx + width];
      const br = grayscale[idx + width + 1];

      // Apply Sobel
      const gx = -tl + tr - 2*l + 2*r - bl + br;
      const gy = -tl - 2*t - tr + bl + 2*b + br;

      // Gradient magnitude
      const magnitude = Math.sqrt(gx * gx + gy * gy);

      // Threshold and normalize
      edges[idx] = magnitude > 50 ? 255 : 0;
    }
  }

  return edges;
}

/**
 * Find rectangular bounds that could be a price tag
 * Uses connected component analysis and rectangle fitting
 */
function findTagBounds(
  edges: Uint8Array,
  width: number,
  height: number
): TagBounds | null {
  // Find horizontal and vertical line segments
  const horizontalLines = findHorizontalLines(edges, width, height);
  const verticalLines = findVerticalLines(edges, width, height);

  // Try to find rectangles from line intersections
  const rectangles = findRectangles(horizontalLines, verticalLines, width, height);

  // Find best rectangle that looks like a price tag
  let bestRect: TagBounds | null = null;
  let bestScore = 0;

  const frameArea = width * height;

  for (const rect of rectangles) {
    const area = rect.width * rect.height;
    const areaRatio = area / frameArea;
    const aspectRatio = rect.width / rect.height;

    // Check constraints
    if (areaRatio < MIN_TAG_AREA_RATIO || areaRatio > MAX_TAG_AREA_RATIO) continue;
    if (aspectRatio < ASPECT_RATIO_MIN || aspectRatio > ASPECT_RATIO_MAX) continue;

    // Score based on:
    // - Centered position (prefer center of frame)
    // - Appropriate size (not too small, not too big)
    // - Good aspect ratio for price tags

    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const centerScore = 1 - (
      Math.abs(centerX - width / 2) / (width / 2) * 0.5 +
      Math.abs(centerY - height / 2) / (height / 2) * 0.5
    );

    // Ideal area is about 15-30% of frame
    const idealAreaRatio = 0.2;
    const areaScore = 1 - Math.abs(areaRatio - idealAreaRatio) / idealAreaRatio;

    // Ideal aspect ratio for Costco tags is about 2:1
    const idealAspect = 2.0;
    const aspectScore = 1 - Math.abs(aspectRatio - idealAspect) / idealAspect;

    const score = centerScore * 0.3 + areaScore * 0.4 + aspectScore * 0.3;

    if (score > bestScore) {
      bestScore = score;
      bestRect = { ...rect, confidence: score };
    }
  }

  // Fallback: use edge density to find likely tag region
  if (!bestRect) {
    bestRect = findTagByEdgeDensity(edges, width, height);
  }

  return bestRect;
}

interface Line {
  start: Point;
  end: Point;
  length: number;
}

/**
 * Find horizontal line segments in edge image
 */
function findHorizontalLines(
  edges: Uint8Array,
  width: number,
  height: number
): Line[] {
  const lines: Line[] = [];
  const minLength = width * 0.1;

  for (let y = 0; y < height; y += 5) { // Sample every 5 rows
    let lineStart = -1;
    let consecutiveEdges = 0;

    for (let x = 0; x < width; x++) {
      if (edges[y * width + x] > 0) {
        if (lineStart === -1) lineStart = x;
        consecutiveEdges++;
      } else {
        if (consecutiveEdges > minLength) {
          lines.push({
            start: { x: lineStart, y },
            end: { x: x - 1, y },
            length: consecutiveEdges,
          });
        }
        lineStart = -1;
        consecutiveEdges = 0;
      }
    }
  }

  return lines;
}

/**
 * Find vertical line segments in edge image
 */
function findVerticalLines(
  edges: Uint8Array,
  width: number,
  height: number
): Line[] {
  const lines: Line[] = [];
  const minLength = height * 0.1;

  for (let x = 0; x < width; x += 5) { // Sample every 5 columns
    let lineStart = -1;
    let consecutiveEdges = 0;

    for (let y = 0; y < height; y++) {
      if (edges[y * width + x] > 0) {
        if (lineStart === -1) lineStart = y;
        consecutiveEdges++;
      } else {
        if (consecutiveEdges > minLength) {
          lines.push({
            start: { x, y: lineStart },
            end: { x, y: y - 1 },
            length: consecutiveEdges,
          });
        }
        lineStart = -1;
        consecutiveEdges = 0;
      }
    }
  }

  return lines;
}

/**
 * Find rectangles from line intersections
 */
function findRectangles(
  horizontalLines: Line[],
  verticalLines: Line[],
  width: number,
  height: number
): TagBounds[] {
  const rectangles: TagBounds[] = [];
  const tolerance = 20; // pixels

  // For each pair of horizontal lines (top and bottom)
  for (let i = 0; i < horizontalLines.length; i++) {
    for (let j = i + 1; j < horizontalLines.length; j++) {
      const top = horizontalLines[i];
      const bottom = horizontalLines[j];

      // Check if they could form top/bottom of a rectangle
      const yDiff = Math.abs(top.start.y - bottom.start.y);
      if (yDiff < height * 0.1 || yDiff > height * 0.8) continue;

      // Check horizontal alignment
      const xOverlap = Math.min(top.end.x, bottom.end.x) - Math.max(top.start.x, bottom.start.x);
      if (xOverlap < width * 0.1) continue;

      // Find matching vertical lines
      for (const left of verticalLines) {
        for (const right of verticalLines) {
          if (left.start.x >= right.start.x) continue;

          // Check if verticals connect the horizontals
          const leftNearTop = Math.abs(left.start.y - top.start.y) < tolerance;
          const leftNearBottom = Math.abs(left.end.y - bottom.start.y) < tolerance;
          const rightNearTop = Math.abs(right.start.y - top.start.y) < tolerance;
          const rightNearBottom = Math.abs(right.end.y - bottom.start.y) < tolerance;

          if (leftNearTop && leftNearBottom && rightNearTop && rightNearBottom) {
            rectangles.push({
              x: left.start.x,
              y: Math.min(top.start.y, left.start.y),
              width: right.start.x - left.start.x,
              height: yDiff,
              confidence: 0,
            });
          }
        }
      }
    }
  }

  return rectangles;
}

/**
 * Fallback: find tag region by edge density
 */
function findTagByEdgeDensity(
  edges: Uint8Array,
  width: number,
  height: number
): TagBounds | null {
  // Divide image into grid and find region with high edge density
  const gridSize = 10;
  const cellW = width / gridSize;
  const cellH = height / gridSize;

  const density: number[][] = [];

  for (let gy = 0; gy < gridSize; gy++) {
    density[gy] = [];
    for (let gx = 0; gx < gridSize; gx++) {
      let count = 0;
      const startX = Math.floor(gx * cellW);
      const startY = Math.floor(gy * cellH);
      const endX = Math.floor((gx + 1) * cellW);
      const endY = Math.floor((gy + 1) * cellH);

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          if (edges[y * width + x] > 0) count++;
        }
      }

      density[gy][gx] = count / (cellW * cellH);
    }
  }

  // Find connected region of high density cells
  const threshold = 0.1;
  let bestRegion: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  let maxSize = 0;

  // Simple flood fill to find largest connected high-density region
  const visited = new Set<string>();

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      if (density[gy][gx] < threshold) continue;
      const key = `${gx},${gy}`;
      if (visited.has(key)) continue;

      // BFS to find connected region
      const region = { minX: gx, minY: gy, maxX: gx, maxY: gy };
      const queue = [{ x: gx, y: gy }];
      let size = 0;

      while (queue.length > 0) {
        const { x, y } = queue.shift()!;
        const k = `${x},${y}`;
        if (visited.has(k)) continue;
        if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) continue;
        if (density[y][x] < threshold) continue;

        visited.add(k);
        size++;

        region.minX = Math.min(region.minX, x);
        region.minY = Math.min(region.minY, y);
        region.maxX = Math.max(region.maxX, x);
        region.maxY = Math.max(region.maxY, y);

        queue.push({ x: x - 1, y });
        queue.push({ x: x + 1, y });
        queue.push({ x, y: y - 1 });
        queue.push({ x, y: y + 1 });
      }

      if (size > maxSize) {
        maxSize = size;
        bestRegion = region;
      }
    }
  }

  if (!bestRegion || maxSize < 4) return null;

  // Convert grid coordinates back to pixels with some padding
  const padding = cellW * 0.5;
  return {
    x: Math.max(0, bestRegion.minX * cellW - padding),
    y: Math.max(0, bestRegion.minY * cellH - padding),
    width: Math.min(width, (bestRegion.maxX - bestRegion.minX + 1) * cellW + padding * 2),
    height: Math.min(height, (bestRegion.maxY - bestRegion.minY + 1) * cellH + padding * 2),
    confidence: maxSize / (gridSize * gridSize),
  };
}

/**
 * Calculate stability based on tag position consistency
 */
function calculateStability(currentBounds: TagBounds | null): number {
  if (!currentBounds) {
    stabilityBuffer = [];
    return 0;
  }

  // Add to buffer
  stabilityBuffer.push(currentBounds);
  if (stabilityBuffer.length > STABILITY_BUFFER_SIZE) {
    stabilityBuffer.shift();
  }

  // Need full buffer for stability calculation
  if (stabilityBuffer.length < STABILITY_BUFFER_SIZE) {
    return stabilityBuffer.length / STABILITY_BUFFER_SIZE * 0.5;
  }

  // Calculate variance of center position
  const centers = stabilityBuffer.map(b => ({
    x: b.x + b.width / 2,
    y: b.y + b.height / 2,
  }));

  const avgX = centers.reduce((s, c) => s + c.x, 0) / centers.length;
  const avgY = centers.reduce((s, c) => s + c.y, 0) / centers.length;

  const variance = centers.reduce((s, c) =>
    s + Math.pow(c.x - avgX, 2) + Math.pow(c.y - avgY, 2), 0
  ) / centers.length;

  // Also check size consistency
  const sizes = stabilityBuffer.map(b => b.width * b.height);
  const avgSize = sizes.reduce((s, sz) => s + sz, 0) / sizes.length;
  const sizeVariance = sizes.reduce((s, sz) =>
    s + Math.pow(sz - avgSize, 2), 0
  ) / sizes.length;

  // Normalize (lower variance = higher stability)
  // Typical good stability: variance < 100 pixels^2
  const positionStability = Math.max(0, 1 - Math.sqrt(variance) / 50);
  const sizeStability = Math.max(0, 1 - Math.sqrt(sizeVariance) / avgSize);

  return positionStability * 0.7 + sizeStability * 0.3;
}

/**
 * Check if conditions are met for auto-capture
 */
export function shouldAutoCapture(analysis: FrameAnalysis): boolean {
  return (
    analysis.isSharp &&
    analysis.tagDetected &&
    analysis.stability >= STABILITY_THRESHOLD
  );
}

/**
 * Reset stability tracking (call when switching views/cameras)
 */
export function resetStabilityTracking(): void {
  stabilityBuffer = [];
}

/**
 * Get capture quality indicator for UI
 */
export function getCaptureQuality(analysis: FrameAnalysis): 'poor' | 'fair' | 'good' | 'excellent' {
  const score =
    (analysis.blurScore * 0.4) +
    (analysis.tagDetected ? 0.3 : 0) +
    (analysis.stability * 0.3);

  if (score >= 0.8) return 'excellent';
  if (score >= 0.6) return 'good';
  if (score >= 0.4) return 'fair';
  return 'poor';
}

/**
 * Extract ROI from image based on tag bounds
 */
export function extractTagROI(
  canvas: HTMLCanvasElement,
  bounds: TagBounds,
  padding: number = 10
): HTMLCanvasElement {
  const roiCanvas = document.createElement('canvas');
  const ctx = roiCanvas.getContext('2d')!;

  // Add padding
  const x = Math.max(0, bounds.x - padding);
  const y = Math.max(0, bounds.y - padding);
  const width = Math.min(canvas.width - x, bounds.width + padding * 2);
  const height = Math.min(canvas.height - y, bounds.height + padding * 2);

  roiCanvas.width = width;
  roiCanvas.height = height;

  ctx.drawImage(
    canvas,
    x, y, width, height,
    0, 0, width, height
  );

  return roiCanvas;
}

/**
 * Add a frame to the rolling buffer for "best frame" selection
 */
export function addToFrameBuffer(
  canvas: HTMLCanvasElement,
  analysis: FrameAnalysis
): void {
  // Clone the canvas
  const clonedCanvas = document.createElement('canvas');
  clonedCanvas.width = canvas.width;
  clonedCanvas.height = canvas.height;
  const ctx = clonedCanvas.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  frameBuffer.push({
    imageData,
    analysis,
    canvas: clonedCanvas,
  });

  // Keep buffer size limited
  if (frameBuffer.length > FRAME_BUFFER_SIZE) {
    frameBuffer.shift();
  }
}

/**
 * Get the best frame from the buffer (highest blur score with tag detected)
 */
export function getBestFrame(): BufferedFrame | null {
  if (frameBuffer.length === 0) return null;

  // Sort by quality score: prioritize tag detection, then blur score
  const sorted = [...frameBuffer].sort((a, b) => {
    // First priority: tag detected
    if (a.analysis.tagDetected && !b.analysis.tagDetected) return -1;
    if (!a.analysis.tagDetected && b.analysis.tagDetected) return 1;

    // Second priority: blur score (higher is better)
    return b.analysis.blurScore - a.analysis.blurScore;
  });

  return sorted[0];
}

/**
 * Get multiple best frames for burst capture / multi-frame OCR
 */
export function getBestFrames(count: number = 3): BufferedFrame[] {
  if (frameBuffer.length === 0) return [];

  // Sort by blur score (higher is better)
  const sorted = [...frameBuffer].sort((a, b) => {
    // Prioritize frames with tag detected
    const aScore = a.analysis.blurScore + (a.analysis.tagDetected ? 0.5 : 0);
    const bScore = b.analysis.blurScore + (b.analysis.tagDetected ? 0.5 : 0);
    return bScore - aScore;
  });

  return sorted.slice(0, count);
}

/**
 * Clear the frame buffer
 */
export function clearFrameBuffer(): void {
  frameBuffer = [];
}

/**
 * Get current frame buffer size
 */
export function getFrameBufferSize(): number {
  return frameBuffer.length;
}

/**
 * Convert a buffered frame to a Blob for OCR
 */
export async function frameToBlob(frame: BufferedFrame): Promise<Blob> {
  return new Promise((resolve, reject) => {
    frame.canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to convert frame to blob'));
      },
      'image/jpeg',
      0.9
    );
  });
}
