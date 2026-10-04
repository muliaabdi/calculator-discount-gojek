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
        const detectedSurcharges = [];
        const detectedDiscounts = [];

        const extractNumbers = (str) => {
            if (!str) return [];
            // 1. Strip percentage parentheticals so 'Service (5%) 17.250' doesn't grab 5
            let s = str.replace(/\(?\d+(?:[\.,]\d+)?\s*%\)?/g, ' ');

            // 2. Normalize letter O/o in number sequences like 5OO -> 500, 398.5oo -> 398.500
            s = s.replace(/(\d)[oO]+/g, (m, d) => d + '0'.repeat(m.length - 1))
                 .replace(/[oO]+(\d)/g, (m, d) => '0'.repeat(m.length - 1) + d);

            // 3. Spaced dots/commas e.g. "398 . 500" or "398. 500" -> "398.500"
            s = s.replace(/(\d+)\s*[\.,]\s*(\d{3})\b/g, '$1.$2');

            // 4. Space as thousand separator e.g. "398 500" -> "398.500"
            s = s.replace(/\b(\d{1,3})\s+(\d{3})\b/g, '$1.$2');

            // 5. Truncated thousands in Rp or total context: "Rp 398.50" or "Rp 398.5" -> "Rp 398.500"
            s = s.replace(/(?:rp\.?\s*)(\d{2,3})[\.,](\d{1,2})\b/gi, (m, p1, p2) => {
                return 'Rp ' + p1 + '.' + p2.padEnd(3, '0');
            });

            const matches = s.match(/(?:rp\.?\s*)?(\d{1,3}(?:[\.,]\d{3})+|\d{1,8})/gi);
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
                   /^(dine\s*in|take\s*away|takeaway|order|table|meja|kasir|cashier|server|waiter|waiters|pax|tgl|tanggal|date|waktu|jam|bill|receipt|no\.|no\s*:|nota)/i.test(lower) ||
                   /^(tax|tex|pb1|pb\s*1|pajak|ppn|service|sc\b|biaya|ongkir|voucher|promo|diskon|discount|rounding)/i.test(lower) ||
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

        const cleanItemName = (name, fallbackIdx) => {
            let clean = name
                .replace(/^[\d\s\.\-xX•*#\[\]\(\)]+/, '')
                .replace(/@[a-zA-Z0-9_\.]+/g, '')
                .replace(/^[£$]5\s+/i, 'ES ')
                .replace(/^e5\s+/i, 'ES ')
                .replace(/[\.\:,\|\-_@\s]+$/, '')
                .trim();
            if (clean.length < 2 && !['mi', 'es'].includes(clean.toLowerCase())) {
                clean = `Menu ${fallbackIdx || (items.length + 1)}`;
            }
            return clean;
        };

        const extractQtyAndCleanName = (rawText, defaultIdx) => {
            let text = rawText.trim();
            let qty = 1;

            // 1. Trailing Qty pattern: e.g. "N. Ayam Bakar x2", "N. Ayam Bakar x 2", "2x", "2 pcs", "2 porsi", "qty 2", "qty: 2"
            const trailingMatch = text.match(/(?:\s+|[\-=_])(?:x\s*(\d{1,2})|(\d{1,2})\s*x|qty\s*[:\.]?\s*(\d{1,2})|(\d{1,2})\s*(?:pcs|pc|porsi|cup|btl|ptg|bh|paket))\s*$/i);
            if (trailingMatch) {
                qty = parseInt(trailingMatch[1] || trailingMatch[2] || trailingMatch[3] || trailingMatch[4], 10) || 1;
                text = text.slice(0, trailingMatch.index).trim();
            } else {
                // 2. Leading Qty pattern: e.g. "2x Ayam Bakar", "2 x Ayam Bakar", "2pcs Ayam Bakar"
                const leadingMatch = text.match(/^(\d{1,2})\s*(?:x|pcs|pc|porsi|cup|btl|ptg|bh|paket)\s+/i);
                if (leadingMatch) {
                    qty = parseInt(leadingMatch[1], 10) || 1;
                    text = text.slice(leadingMatch[0].length).trim();
                }
            }

            // 3. Inline @ pricing: e.g. "2 @ 47.000" or "@ 47.000"
            const atMatch = text.match(/(?:^|\s+)(?:(\d{1,2})\s*)?@\s*(?:rp\.?\s*)?[\d\.,]+/i);
            if (atMatch) {
                if (atMatch[1]) {
                    qty = parseInt(atMatch[1], 10) || qty;
                }
                text = text.replace(atMatch[0], '').trim();
            }

            const cleaned = cleanItemName(text, defaultIdx);
            return {
                qty: Math.max(1, qty),
                name: cleaned
            };
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

            // Detect Surcharges (Tax, Service, PB1, PPN, Rounding, Delivery, Ongkir, Fees)
            if (/(?:^|\b)(service|sc\b|svc\b|tax|pb\s*1|pb1|ppn|pajak|restaurant\s*tax|rounding|pembulatan|ongkir|delivery|biaya\s*layanan|biaya\s*jasa|biaya\s*antar|biaya\s*aplikasi)(?:\b|[:\s(])/i.test(lower)) {
                let nums = extractNumbers(line);
                if (nums.length === 0 && i + 1 < rawLines.length) {
                    nums = extractNumbers(rawLines[i + 1]);
                }
                if (nums.length > 0) {
                    const val = nums[nums.length - 1];
                    if (val > 0) {
                        detectedSurcharges.push({ line: line.trim(), amount: val });
                    }
                }
                continue;
            }

            // Detect Discounts / Promo
            if (/(?:^|\b)(diskon|discount|promo|potongan|voucher|hemat)(?:\b|[:\s])/i.test(lower)) {
                let nums = extractNumbers(line);
                if (nums.length === 0 && i + 1 < rawLines.length) {
                    nums = extractNumbers(rawLines[i + 1]);
                }
                if (nums.length > 0) {
                    const val = nums[nums.length - 1];
                    if (val > 0) {
                        detectedDiscounts.push({ line: line.trim(), amount: val });
                    }
                }
                continue;
            }

            // Detect Grand Total / Total / Total Pembayaran / Total Dibayar / Due / Amount
            if (/(?:^|\b)(grand\s*total|total\s*bayar|total\s*dibayar|total\s*akhir|total\s*tagihan|total\s*pembayaran|total|tolal|tota[l1|i!]|tot\b|due|amount)(?:\b|[:\s])/i.test(lower)) {
                if (!lower.includes('item') && !lower.includes('qty') && !lower.includes('porsi') && !lower.includes('diskon')) {
                    let nums = extractNumbers(line);
                    if (nums.length === 0 && i + 1 < rawLines.length) {
                        nums = extractNumbers(rawLines[i + 1]);
                        if (nums.length > 0) i++;
                    }
                    if (nums.length > 0) {
                        let tVal = nums[nums.length - 1];
                        // If tVal < 1000 and next line has 3 digits (e.g. 398 on this line, 500 on next line due to thumb or paper fold)
                        if (tVal < 1000 && i + 1 < rawLines.length) {
                            const nextNums = extractNumbers(rawLines[i + 1]);
                            if (nextNums.length > 0 && nextNums[0] >= 100 && nextNums[0] <= 999) {
                                tVal = tVal * 1000 + nextNums[0];
                                i++; // consume next line
                            }
                        }
                        detectedTotal = tVal;
                    }
                    continue;
                }
            }

            if (isIgnoredRow(lower)) continue;

            // Pattern 1: Same-line item (e.g. 'N.Ayam Bakar x2 Rp94.000' or '1 Paket Nasi Ayam... @Rp36.500 Rp36.500')
            const sameLineMatch = line.match(/^(.+?)(?:\s+|[\.:\-_=]+)\s*(?:rp\.?\s*)?(\d{1,3}(?:[\.,]\d{3})+|\d{3,8})$/i);
            if (sameLineMatch) {
                const { name: nameCandidate, qty } = extractQtyAndCleanName(sameLineMatch[1], items.length + 1);
                const price = parseInt(sameLineMatch[2].replace(/[\.,]/g, ''), 10);
                if (nameCandidate.length >= 2 && price > 0 && !isIgnoredRow(nameCandidate.toLowerCase())) {
                    items.push({
                        name: nameCandidate,
                        price: formatNumber(price),
                        qty: qty
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
                        let { name: nameCandidate, qty } = extractQtyAndCleanName(line, items.length + 1);

                        if (qty === 1) {
                            const nextQtyMatch = nextLine.match(/(?:^|\s)(?:x\s*(\d{1,2})|(\d{1,2})\s*x|qty\s*[:\.]?\s*(\d{1,2})|(\d{1,2})\s*(?:pcs|pc|porsi|cup|btl|ptg|bh|paket))\b/i);
                            if (nextQtyMatch) {
                                qty = parseInt(nextQtyMatch[1] || nextQtyMatch[2] || nextQtyMatch[3] || nextQtyMatch[4], 10) || 1;
                            }
                        }

                        if (nameCandidate.length >= 2 && price > 0 && !isIgnoredRow(nameCandidate.toLowerCase())) {
                            items.push({
                                name: nameCandidate,
                                price: formatNumber(price),
                                qty: qty
                            });
                            i++;
                            continue;
                        }
                    }
                }
            }
        }

        const surchargeSum = detectedSurcharges.reduce((acc, s) => acc + s.amount, 0);
        const discountSum = detectedDiscounts.reduce((acc, d) => acc + d.amount, 0);

        if (!detectedSubtotal && items.length > 0) {
            const sum = items.reduce((acc, it) => {
                const p = parseInt(String(it.price).replace(/[^0-9]/g, ''), 10);
                return acc + (isNaN(p) ? 0 : p);
            }, 0);
            if (sum > 0) detectedSubtotal = sum;
        }

        const calculatedFromSubtotal = detectedSubtotal ? (detectedSubtotal + surchargeSum - discountSum) : 0;

        // Fallback or correction for detectedTotal:
        // Case 1: detectedTotal is severely truncated (e.g. 398 instead of 398.500)
        if (detectedTotal && detectedTotal < 1000) {
            if (calculatedFromSubtotal > 0 && String(calculatedFromSubtotal).startsWith(String(detectedTotal))) {
                detectedTotal = calculatedFromSubtotal;
            } else if (calculatedFromSubtotal > 0 && surchargeSum > 0) {
                detectedTotal = calculatedFromSubtotal;
            } else if (detectedSubtotal && (detectedTotal * 1000 >= detectedSubtotal * 0.5)) {
                detectedTotal = detectedTotal * 1000;
            } else if (calculatedFromSubtotal > 0) {
                detectedTotal = calculatedFromSubtotal;
            } else {
                detectedTotal = detectedTotal * 1000;
            }
        }

        // Case 2: detectedTotal is missing or identical to subtotal while surcharges exist
        if (!detectedTotal || (detectedTotal === detectedSubtotal && surchargeSum > 0)) {
            // Check bottom lines for grand total
            for (let j = rawLines.length - 1; j >= 0; j--) {
                const l = rawLines[j].toLowerCase();
                if (isStopFooter(l)) continue;
                const nums = extractNumbers(rawLines[j]);
                if (nums.length > 0) {
                    const lastNum = nums[nums.length - 1];
                    if (detectedSubtotal && lastNum > detectedSubtotal) {
                        detectedTotal = lastNum;
                        break;
                    }
                }
            }
            if ((!detectedTotal || detectedTotal === detectedSubtotal) && calculatedFromSubtotal > 0) {
                detectedTotal = calculatedFromSubtotal;
            }
        }

        if (!detectedTotal && detectedSubtotal) {
            detectedTotal = detectedSubtotal;
        }

        return {
            subtotal: detectedSubtotal ? formatNumber(detectedSubtotal) : null,
            total: detectedTotal ? formatNumber(detectedTotal) : null,
            surcharges: detectedSurcharges,
            totalSurcharges: surchargeSum,
            discounts: detectedDiscounts,
            totalDiscounts: discountSum,
            items,
            rawText: text
        };
    }
};

window.OCR = OCR;
