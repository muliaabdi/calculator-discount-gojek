/**
 * BagiPromo OCR & Receipt Parser Engine
 * Handles image preprocessing, Tesseract.js lazy-loading, and multi-format receipt regex parsing.
 */
const OCR = {
    loadTesseract() {
        return new Promise((resolve, reject) => {
            if (window.Tesseract) return resolve(window.Tesseract);
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
            script.onload = () => resolve(window.Tesseract);
            script.onerror = () => reject(new Error('Gagal memuat Tesseract.js'));
            document.head.appendChild(script);
        });
    },

    preprocessImage(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Upscale low-res cropped images so characters have enough pixels for Tesseract
                const minDimension = Math.min(width, height);
                if (minDimension < 700) {
                    const scale = Math.min(3.5, 950 / minDimension);
                    width = Math.round(width * scale);
                    height = Math.round(height * scale);
                } else if (width > 2200 || height > 2200) {
                    const maxDim = 2200;
                    const scale = maxDim / Math.max(width, height);
                    width = Math.round(width * scale);
                    height = Math.round(height * scale);
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);

                // Gentle contrast & grayscale to preserve fine character strokes without clipping
                try {
                    const imgData = ctx.getImageData(0, 0, width, height);
                    const d = imgData.data;
                    for (let i = 0; i < d.length; i += 4) {
                        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                        const contrast = (gray - 128) * 1.15 + 128;
                        const finalVal = Math.min(255, Math.max(0, contrast));
                        d[i] = finalVal;
                        d[i + 1] = finalVal;
                        d[i + 2] = finalVal;
                    }
                    ctx.putImageData(imgData, 0, 0);
                } catch (e) { }
                resolve(canvas.toDataURL('image/png'));
            };
            img.src = dataUrl;
        });
    },

    parseReceiptText(text, formatNumberFn) {
        if (!text) return { subtotal: null, total: null, items: [], rawText: '' };
        const rawLines = text.split('\n')
            .map(l => l.replace(/^[\|\s\-=_*#]+|[\|\s\-=_*#]+$/g, '').trim())
            .filter(Boolean);

        const items = [];
        let detectedSubtotal = null;
        let detectedTotal = null;

        const extractNumbers = (str) => {
            if (!str) return [];
            const matches = str.match(/(?:rp\.?\s*)?(\d{1,3}(?:[\.,]\d{3})+|\d{3,8})/gi);
            if (!matches) return [];
            return matches.map(m => {
                const clean = m.replace(/[^0-9]/g, '');
                return parseInt(clean, 10);
            }).filter(n => !isNaN(n));
        };

        const isDashedOrSeparator = (line) => /^[\-=_*.]{3,}$/.test(line);

        const isStopFooter = (lower) => {
            return /^(detail\s*pengantaran|kontak\s*gojek|tentang\s*gofood|bantuan|laporkan\s*masalah)/i.test(lower) ||
                   /^(terima\s*kasih|thank\s*you|hatur\s*nuhun|matur\s*nuwun|kunjungan)/i.test(lower);
        };

        const isIgnoredRow = (lower) => {
            return /^[+\-]/.test(lower) || // modifier / discount lines like + Level 1 or -Rp12.000
                   /^(dine\s*in|take\s*away|takeaway|order|table|meja|kasir|cashier|server|pax|tgl|tanggal|date|waktu|jam|bill|receipt|no\.|no\s*:|nota)/i.test(lower) ||
                   /^(tax|tex|pb1|pb\s*1|pajak|ppn|service|sc\b|biaya|ongkir|voucher|promo|diskon|discount)/i.test(lower) ||
                   /(?:^|\b)(bayar\s*pakai|dibayar|metode\s*pembayaran|payment|paid|mandiri|bca|bni|bri|cimb|debit|kredit|credit|qris|tunai|cash|gopay|ovo|dana|shopeepay|shopee\s*pay|kembali|kembalian|change)(?:\b|$)/i.test(lower) ||
                   /^(sub\s*total|sb\s*total|sbtol|sbtl|subttl|sub-total|sub\s*tot|sb\s*tot|total\s*harga)/i.test(lower) ||
                   /^(grand\s*total|total\b|tolal|tota[l1|])/i.test(lower) ||
                   /^\d+\s*items?\b/i.test(lower) || // e.g. '13 items' in Abuba
                   /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(lower) ||
                   /^\d{1,2}:\d{2}/.test(lower);
        };

        const isQtyPriceLine = (line) => {
            const trimmed = line.trim();
            return /^(?:[0-9tiI|]+[\s\.\,]*x|x\s*\d+|[0-9tiI|]+\s*@|@\s*rp\.?\s*\d+|\d+\s*pcs|\d+\s*porsi|\d+\s+\d{1,3}[\.,]\d{3}|\d{1,3}[\.,]\d{3}\s*x)/i.test(trimmed) ||
                   /^[0-9tiI|\s\.xX@\,]+$/.test(trimmed);
        };

        const cleanItemName = (name) => {
            let clean = name
                .replace(/^[\d\s\.\-xX•*#\[\]\(\)]+/, '')
                .replace(/@[a-zA-Z0-9_\.]+/g, '')
                .replace(/^[£$]5\s+/i, 'ES ')
                .replace(/^e5\s+/i, 'ES ')
                .replace(/[\.\:,\|\-_@\s]+$/, '')
                .trim();
            if (clean.length < 3 && !['mi', 'es'].includes(clean.toLowerCase())) {
                clean = `Menu ${items.length + 1}`;
            }
            return clean;
        };

        const formatNumber = formatNumberFn || ((num) => new Intl.NumberFormat('id-ID').format(num));

        for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i];
            const lower = line.toLowerCase();

            if (isDashedOrSeparator(line)) continue;
            if (isStopFooter(lower)) break; // Stop parsing when reaching receipt footer

            // Detect Subtotal (e.g. Subtotal, Sub Total, sb Total, sbtol, Total Harga)
            if (/(?:^|\b)(sub\s*total|sb\s*total|sbtol|sbtl|subttl|sub-total|sub\s*tot|sb\s*tot|total\s*pesanan|total\s*menu|total\s*harga|harga\s*makanan)(?:\b|$)/i.test(lower)) {
                let nums = extractNumbers(line);
                if (nums.length === 0 && i + 1 < rawLines.length) {
                    nums = extractNumbers(rawLines[i + 1]);
                }
                if (nums.length > 0 && !detectedSubtotal) {
                    detectedSubtotal = nums[nums.length - 1];
                }
                continue;
            }

            // Detect Grand Total / Total / Total Pembayaran / Total Dibayar
            if (/(?:^|\b)(grand\s*total|total\s*bayar|total\s*dibayar|total\s*akhir|total\s*tagihan|total\s*pembayaran|total|tolal|tota[l1|]|tot\b)(?:\b|$)/i.test(lower)) {
                if (!lower.includes('item') && !lower.includes('qty') && !lower.includes('porsi') && !lower.includes('diskon')) {
                    let nums = extractNumbers(line);
                    if (nums.length === 0 && i + 1 < rawLines.length) {
                        nums = extractNumbers(rawLines[i + 1]);
                    }
                    if (nums.length > 0 && !detectedTotal) {
                        detectedTotal = nums[nums.length - 1];
                    }
                    continue;
                }
            }

            if (isIgnoredRow(lower)) continue;

            // Pattern 1: Same-line item (e.g. '1 Paket Nasi Ayam... @Rp36.500 Rp36.500' or '2 PERKEDEL JAGUNG Rp10.000')
            const sameLineMatch = line.match(/^(.+?)(?:\s+|[\.:\-_=]+)\s*(?:rp\.?\s*)?(\d{1,3}(?:[\.,]\d{3})+|\d{3,8})$/i);
            if (sameLineMatch) {
                const nameCandidate = cleanItemName(sameLineMatch[1]);
                const price = parseInt(sameLineMatch[2].replace(/[\.,]/g, ''), 10);
                if (nameCandidate.length >= 2 && price > 0 && !isIgnoredRow(nameCandidate.toLowerCase())) {
                    items.push({
                        name: nameCandidate,
                        price: formatNumber(price)
                    });
                    continue;
                }
            }

            // Pattern 2: Two-line item (Line i: Name, Line i+1: Qty/Price)
            if (i + 1 < rawLines.length) {
                const nextLine = rawLines[i + 1];
                if (isQtyPriceLine(nextLine)) {
                    const nums = extractNumbers(nextLine);
                    if (nums.length > 0) {
                        const price = nums[nums.length - 1];
                        const nameCandidate = cleanItemName(line);

                        if (nameCandidate.length >= 2 && price > 0 && !isIgnoredRow(nameCandidate.toLowerCase())) {
                            items.push({
                                name: nameCandidate,
                                price: formatNumber(price)
                            });
                            i++;
                            continue;
                        }
                    }
                }
            }
        }

        if (!detectedSubtotal && items.length > 0) {
            const sum = items.reduce((acc, it) => {
                const p = parseInt(String(it.price).replace(/[^0-9]/g, ''), 10);
                return acc + (isNaN(p) ? 0 : p);
            }, 0);
            if (sum > 0) detectedSubtotal = sum;
        }

        if (!detectedTotal && detectedSubtotal) {
            detectedTotal = detectedSubtotal;
        }

        return {
            subtotal: detectedSubtotal ? formatNumber(detectedSubtotal) : null,
            total: detectedTotal ? formatNumber(detectedTotal) : null,
            items,
            rawText: text
        };
    }
};

window.OCR = OCR;
