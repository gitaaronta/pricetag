#!/usr/bin/env node
/**
 * Batch OCR Test Script
 *
 * Usage:
 *   node batch-test-ocr.js <folder-path>
 *   node batch-test-ocr.js ~/Desktop/costco-tags
 *
 * Supports: .jpg, .jpeg, .png, .webp
 *
 * To get test images:
 * 1. Google Images: Search "costco price tag" -> Tools -> Past week
 * 2. Reddit: Browse r/Costco and save price tag photos
 * 3. Roboflow: https://universe.roboflow.com/richard-wellington-ve3z3/costco
 */

const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');

// Regex patterns
const ITEM_NUMBER_PATTERN = /\b(\d{6,8})\b/g;
const PRICE_PATTERN = /\$?\s*(\d{1,4})[.,](\d{2})\b/g;
const ASTERISK_PATTERN = /[\*\u2022\u2217\u066D]|sk$/i;

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

async function processImage(imagePath) {
  const filename = path.basename(imagePath);

  try {
    const { data } = await Tesseract.recognize(imagePath, 'eng');

    // Pre-process: collapse spaced digits
    let text = data.text.replace(/(\d)\s+(?=\d)/g, '$1');

    // Extract item number
    const itemMatches = [];
    let match;
    ITEM_NUMBER_PATTERN.lastIndex = 0;
    while ((match = ITEM_NUMBER_PATTERN.exec(text)) !== null) {
      itemMatches.push(match[1]);
    }

    let itemNumber = null;
    for (const m of itemMatches) {
      if (m.length === 7) { itemNumber = m; break; }
    }
    if (!itemNumber && itemMatches.length > 0) {
      itemNumber = itemMatches[0];
    }

    // Extract price
    const priceMatches = [];
    PRICE_PATTERN.lastIndex = 0;
    while ((match = PRICE_PATTERN.exec(text)) !== null) {
      priceMatches.push({ dollars: match[1], cents: match[2] });
    }

    let price = null;
    let priceEnding = null;
    if (priceMatches.length > 0) {
      const best = priceMatches.reduce((a, b) =>
        parseInt(a.dollars) > parseInt(b.dollars) ? a : b
      );
      price = parseFloat(`${best.dollars}.${best.cents}`);
      priceEnding = `.${best.cents}`;
    }

    const hasAsterisk = ASTERISK_PATTERN.test(text);
    const success = itemNumber !== null && price !== null;

    return {
      filename,
      success,
      itemNumber,
      price,
      priceEnding,
      hasAsterisk,
      confidence: data.confidence,
      rawText: text.substring(0, 200) + (text.length > 200 ? '...' : '')
    };
  } catch (error) {
    return {
      filename,
      success: false,
      error: error.message
    };
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Batch OCR Test Script for Costco Price Tags
============================================

Usage: node batch-test-ocr.js <folder-path>

Example:
  node batch-test-ocr.js ~/Desktop/costco-tags

How to get test images:
  1. Google Images: Search "costco price tag" -> Tools -> Past week
  2. Reddit: Browse r/Costco, r/CostcoCanada - save price tag photos
  3. Roboflow Dataset: https://universe.roboflow.com/search?q=costco

Tip: Create a folder and save 10-100 images there, then run this script.
`);
    process.exit(0);
  }

  const folderPath = args[0];

  if (!fs.existsSync(folderPath)) {
    console.error(`Folder not found: ${folderPath}`);
    process.exit(1);
  }

  const files = fs.readdirSync(folderPath)
    .filter(f => SUPPORTED_EXTENSIONS.includes(path.extname(f).toLowerCase()))
    .map(f => path.join(folderPath, f));

  if (files.length === 0) {
    console.error(`No image files found in: ${folderPath}`);
    process.exit(1);
  }

  console.log(`\nFound ${files.length} images to process...\n`);
  console.log('='.repeat(80));

  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    process.stdout.write(`\r[${i + 1}/${files.length}] Processing: ${path.basename(file).substring(0, 40)}...`);

    const result = await processImage(file);
    results.push(result);

    if (result.success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\nRESULTS SUMMARY');
  console.log('='.repeat(80));

  // Print detailed results
  for (const r of results) {
    const status = r.success ? '✓' : '✗';
    const item = r.itemNumber || 'N/A';
    const price = r.price ? `$${r.price.toFixed(2)}` : 'N/A';
    const asterisk = r.hasAsterisk ? '*' : '';
    const conf = r.confidence ? `${Math.round(r.confidence)}%` : 'N/A';

    console.log(`\n${status} ${r.filename}`);
    console.log(`  Item: ${item}  Price: ${price}${asterisk}  Confidence: ${conf}`);
    if (r.error) console.log(`  Error: ${r.error}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log(`\nTOTAL: ${files.length} images`);
  console.log(`SUCCESS: ${successCount} (${Math.round(successCount/files.length*100)}%)`);
  console.log(`FAILED: ${failCount} (${Math.round(failCount/files.length*100)}%)`);
  console.log('='.repeat(80));

  // Save detailed JSON report
  const reportPath = path.join(folderPath, 'ocr-test-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nDetailed report saved to: ${reportPath}`);
}

main().catch(console.error);
