/**
 * Test script for OCR extraction
 * Run with: node test-ocr.js /path/to/image.png
 */

const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');

// Regex patterns (same as clientOcr.ts)
const ITEM_NUMBER_PATTERN = /\b(\d{6,8})\b/g;
const PRICE_PATTERN = /\$?\s*(\d{1,4})[.,](\d{2})\b/g;
// Asterisk can be read as various characters
const ASTERISK_PATTERN = /[\*\u2022\u2217\u066D]|(?:^|\s)[*xX\+](?:\s|$)|sk$/i;

async function testOCR(imagePath) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${path.basename(imagePath)}`);
  console.log('='.repeat(60));

  try {
    // Try with PSM 6 (assume uniform block of text) which works better for price tags
    const { data } = await Tesseract.recognize(imagePath, 'eng', {
      tessedit_pageseg_mode: '6',
      logger: m => {
        if (m.status === 'recognizing text') {
          process.stdout.write(`\rProgress: ${Math.round(m.progress * 100)}%`);
        }
      }
    });

    console.log('\n\n--- Raw OCR Text ---');
    console.log(data.text);

    // Pre-process: collapse spaced digits (e.g., "3 3 9 9 6 3 1" -> "3399631")
    let text = data.text.replace(/(\d)\s+(?=\d)/g, '$1');
    console.log('\n--- After collapsing spaced digits ---');
    console.log(text);

    console.log('\n--- Tesseract Confidence ---');
    console.log(`${data.confidence}%`);

    // Extract item number
    const itemMatches = [];
    let match;
    ITEM_NUMBER_PATTERN.lastIndex = 0;
    while ((match = ITEM_NUMBER_PATTERN.exec(text)) !== null) {
      itemMatches.push(match[1]);
    }

    // Prefer 7-digit numbers
    let itemNumber = null;
    for (const m of itemMatches) {
      if (m.length === 7) {
        itemNumber = m;
        break;
      }
    }
    if (!itemNumber && itemMatches.length > 0) {
      itemNumber = itemMatches[0];
    }

    // Extract price (take largest)
    const priceMatches = [];
    PRICE_PATTERN.lastIndex = 0;
    while ((match = PRICE_PATTERN.exec(text)) !== null) {
      priceMatches.push({
        dollars: match[1],
        cents: match[2],
        full: `${match[1]}.${match[2]}`
      });
    }

    let price = null;
    let priceEnding = null;
    if (priceMatches.length > 0) {
      const best = priceMatches.reduce((a, b) =>
        parseInt(a.dollars) > parseInt(b.dollars) ? a : b
      );
      price = parseFloat(best.full);
      priceEnding = `.${best.cents}`;
    }

    // Check for asterisk
    const hasAsterisk = ASTERISK_PATTERN.test(text);

    // Extract description (uppercase words)
    const lines = text.split('\n');
    const descWords = [];
    for (const line of lines) {
      const words = line.match(/[A-Z][A-Z]{3,}/g);
      if (words) {
        descWords.push(...words.filter(w =>
          !['PRICE', 'ITEM', 'EACH', 'TOTAL', 'SALE', 'SELL', 'LITER'].includes(w)
        ));
      }
    }
    const description = descWords.slice(0, 5).join(' ') || null;

    console.log('\n--- Extracted Data ---');
    console.log(`Item Number: ${itemNumber || 'NOT FOUND'}`);
    console.log(`Price: ${price !== null ? `$${price.toFixed(2)}` : 'NOT FOUND'}`);
    console.log(`Price Ending: ${priceEnding || 'N/A'}`);
    console.log(`Has Asterisk: ${hasAsterisk}`);
    console.log(`Description: ${description || 'NOT FOUND'}`);
    console.log(`\nSuccess: ${itemNumber && price !== null ? 'YES ✓' : 'NO ✗'}`);

    return { itemNumber, price, priceEnding, hasAsterisk, description };
  } catch (error) {
    console.error('Error:', error.message);
    return null;
  }
}

// Run tests
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node test-ocr.js <image1> [image2] ...');
    console.log('Example: node test-ocr.js ~/Desktop/pricetag1.png ~/Desktop/pricetag2.png');
    process.exit(1);
  }

  for (const imagePath of args) {
    if (fs.existsSync(imagePath)) {
      await testOCR(imagePath);
    } else {
      console.log(`File not found: ${imagePath}`);
    }
  }
}

main();
