"""OCR Service for Costco shelf tag extraction"""
import re
import io
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

import pytesseract
from PIL import Image
import imagehash
import cv2
import numpy as np


@dataclass
class OCRExtraction:
    """Result of OCR extraction from price tag"""
    success: bool
    confidence: float

    item_number: Optional[str] = None
    price: Optional[Decimal] = None
    unit_price: Optional[Decimal] = None
    unit_measure: Optional[str] = None
    description: Optional[str] = None

    price_ending: Optional[str] = None
    has_asterisk: bool = False

    image_phash: Optional[str] = None
    error: Optional[str] = None


class OCRService:
    """
    Extract pricing data from Costco shelf tags using Tesseract OCR.

    Costco shelf tag format typically includes:
    - Item number (7 digits)
    - Price (large, prominent)
    - Unit price (smaller, per oz/lb/ct)
    - Description
    - Asterisk (*) if item is being discontinued
    """

    # Patterns for Costco price tags
    ITEM_NUMBER_PATTERN = re.compile(r'\b(\d{6,8})\b')
    PRICE_PATTERN = re.compile(r'\$?\s*(\d{1,4})[.,](\d{2})\b')
    UNIT_PRICE_PATTERN = re.compile(r'(\d+[.,]\d{2,4})\s*/\s*(oz|lb|ct|ea|qt|gal|ml|L|kg|g)', re.IGNORECASE)
    ASTERISK_PATTERN = re.compile(r'\*')

    def __init__(self):
        # Tesseract config for price tag recognition
        self.tesseract_config = '--oem 3 --psm 6 -c tessedit_char_whitelist=0123456789.$*ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz/., '

    async def extract_price_tag(self, image_bytes: bytes) -> OCRExtraction:
        """
        Extract pricing information from a price tag image.

        Returns OCRExtraction with all parsed fields and confidence score.
        """
        try:
            # Load and preprocess image
            image = Image.open(io.BytesIO(image_bytes))
            processed = self._preprocess_image(image)

            # Calculate perceptual hash for deduplication
            phash = str(imagehash.phash(image))

            # Run OCR
            ocr_result = pytesseract.image_to_data(
                processed,
                config=self.tesseract_config,
                output_type=pytesseract.Output.DICT,
            )

            # Extract text and confidence
            text_parts = []
            confidences = []
            for i, conf in enumerate(ocr_result['conf']):
                if int(conf) > 0:
                    text_parts.append(ocr_result['text'][i])
                    confidences.append(int(conf))

            full_text = ' '.join(text_parts)
            avg_confidence = sum(confidences) / len(confidences) / 100 if confidences else 0

            # Parse fields
            item_number = self._extract_item_number(full_text)
            price, price_ending = self._extract_price(full_text)
            unit_price, unit_measure = self._extract_unit_price(full_text)
            has_asterisk = bool(self.ASTERISK_PATTERN.search(full_text))
            description = self._extract_description(full_text, item_number)

            # Determine success (must have at least item number and price)
            success = item_number is not None and price is not None

            # Adjust confidence based on what we found
            extraction_confidence = avg_confidence
            if not item_number:
                extraction_confidence *= 0.5
            if not price:
                extraction_confidence *= 0.3

            return OCRExtraction(
                success=success,
                confidence=round(extraction_confidence, 2),
                item_number=item_number,
                price=price,
                unit_price=unit_price,
                unit_measure=unit_measure,
                description=description,
                price_ending=price_ending,
                has_asterisk=has_asterisk,
                image_phash=phash,
            )

        except Exception as e:
            return OCRExtraction(
                success=False,
                confidence=0.0,
                error=str(e),
            )

    def _preprocess_image(self, image: Image.Image) -> Image.Image:
        """Preprocess image for better OCR accuracy on Costco price tags."""
        # Convert to numpy array
        img_array = np.array(image)

        # Convert to grayscale if needed
        if len(img_array.shape) == 3:
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
        else:
            gray = img_array

        # Resize if image is too small (helps OCR accuracy)
        height, width = gray.shape
        if width < 800:
            scale = 800 / width
            gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

        # Increase contrast using CLAHE (helps with varied lighting)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)

        # Apply bilateral filter to reduce noise while keeping edges sharp
        denoised = cv2.bilateralFilter(enhanced, 9, 75, 75)

        # Otsu's thresholding (better for varied backgrounds like yellow Costco tags)
        _, thresh = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        return Image.fromarray(thresh)

    def _extract_item_number(self, text: str) -> Optional[str]:
        """Extract 7-digit Costco item number."""
        matches = self.ITEM_NUMBER_PATTERN.findall(text)
        # Prefer 7-digit numbers (standard Costco item numbers)
        for match in matches:
            if len(match) == 7:
                return match
        # Fall back to first match
        return matches[0] if matches else None

    def _extract_price(self, text: str) -> tuple[Optional[Decimal], Optional[str]]:
        """Extract main price and its ending (.97, .00, .99, etc.)."""
        matches = self.PRICE_PATTERN.findall(text)
        if not matches:
            return None, None

        # Take the match with largest dollar amount (likely main price)
        best_match = max(matches, key=lambda m: int(m[0]))
        dollars, cents = best_match
        price = Decimal(f"{dollars}.{cents}")
        price_ending = f".{cents}"

        return price, price_ending

    def _extract_unit_price(self, text: str) -> tuple[Optional[Decimal], Optional[str]]:
        """Extract unit price (e.g., $0.45/oz)."""
        match = self.UNIT_PRICE_PATTERN.search(text)
        if not match:
            return None, None

        price_str = match.group(1).replace(',', '.')
        unit = match.group(2).lower()

        return Decimal(price_str), unit

    def _extract_description(self, text: str, item_number: Optional[str]) -> Optional[str]:
        """Extract product description from text."""
        # Remove numbers and special chars, get remaining words
        words = re.findall(r'[A-Za-z]{2,}', text)
        if not words:
            return None

        # Filter out common non-description words
        skip_words = {'oz', 'lb', 'ct', 'ea', 'qt', 'gal', 'ml', 'kg', 'per', 'unit'}
        description_words = [w for w in words if w.lower() not in skip_words]

        return ' '.join(description_words[:10]) if description_words else None
