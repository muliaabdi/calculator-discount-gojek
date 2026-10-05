/**
 * BagiPromo Main Application Script
 * Orchestrates Alpine.js reactive UI, storage, WhatsApp export, canvas receipt generation, and OCR integration.
 */
function calculator() {
    const STORAGE_KEY = 'bagi_promo_v2';
    const LANG_KEY = 'bagi_promo_lang';
    const STATS_KEY = 'bagi_promo_lifetime_stats';
    const KV_BUCKET = 'Lm8Q83y1s7Tt7Cn41FQvJk';
    const isProduction = typeof window !== 'undefined' && window.location.hostname === 'calculator.muliaabdi.net';
    const KV_URL = isProduction ? '/api/stats' : `https://kvdb.io/${KV_BUCKET}/stats`;

    return {
        lang: 'id',
        state: {
            persons: [
                { id: 1, name: 'Orang 1', price: null, roundingAdjustment: 0 },
                { id: 2, name: 'Orang 2', price: null, roundingAdjustment: 0 },
                { id: 3, name: 'Orang 3', price: null, roundingAdjustment: 0 }
            ],
            total_price: null,
            total_ammount: null,
            payment_info: ''
        },
        stats: {
            totalBilled: 100000,
            totalSaved: 35000,
            count: 1
        },
        showShareModal: false,
        showFaqModal: false,
        shareTab: 'link',
        copied: false,
        linkCopied: false,
        copyingImage: false,
        toastMessage: '',
        lastRecordedHash: '',
        selectedPersonIds: [],
        isSharedBillView: false,
        lockedBillPayload: null,

        // OCR Scanner State
        showScanPickerModal: false,
        showOcrModal: false,
        showSplitModal: false,
        splitModalTargetIndex: null,
        splitModalCount: 2,
        ocrScanning: false,
        ocrProgress: 0,
        ocrStatus: '',
        ocrPreviewUrl: '',
        ocrTab: 'result', // 'result' | 'raw'
        ocrAutoSplitQty: true,
        ocrResult: {
            subtotal: null,
            total: null,
            surcharges: [],
            totalSurcharges: 0,
            discounts: [],
            totalDiscounts: 0,
            items: [],
            rawText: ''
        },

        init() {
            const savedLang = localStorage.getItem(LANG_KEY);
            if (savedLang === 'id' || savedLang === 'en') {
                this.lang = savedLang;
            }
            this.loadFromStorage();
            this.checkSharedLink();
            this.loadStats();
            this.setupGlobalPasteListener();
            this.$watch('state', () => {
                if (this.isSharedBillView && this.lockedBillPayload) {
                    let reverted = false;
                    if (this.state.total_price !== this.lockedBillPayload.tp) {
                        this.state.total_price = this.lockedBillPayload.tp;
                        reverted = true;
                    }
                    if (this.state.total_ammount !== this.lockedBillPayload.ta) {
                        this.state.total_ammount = this.lockedBillPayload.ta;
                        reverted = true;
                    }
                    if (this.state.payment_info !== (this.lockedBillPayload.pi || '')) {
                        this.state.payment_info = this.lockedBillPayload.pi || '';
                        reverted = true;
                    }
                    if (this.lockedBillPayload.m && Array.isArray(this.state.persons)) {
                        this.lockedBillPayload.m.forEach((locked, i) => {
                            if (this.state.persons[i]) {
                                if (this.state.persons[i].price !== locked.p) {
                                    this.state.persons[i].price = locked.p;
                                    reverted = true;
                                }
                                if (this.state.persons[i].name !== locked.n) {
                                    this.state.persons[i].name = locked.n;
                                    reverted = true;
                                }
                            }
                        });
                    }
                    if (reverted) return;
                }
                this.saveToStorage();
            });
        },

        setLanguage(l) {
            this.lang = l;
            try {
                localStorage.setItem(LANG_KEY, l);
            } catch (e) { }
        },

        t(key, fallback = '') {
            const dict = (window.I18N && window.I18N[this.lang]) || (window.I18N && window.I18N.id) || {};
            if (dict && dict[key]) return dict[key];
            if (window.I18N && window.I18N.id && window.I18N.id[key]) return window.I18N.id[key];
            return fallback || key;
        },

        showToast(msg) {
            this.toastMessage = msg;
            setTimeout(() => {
                this.toastMessage = '';
            }, 2500);
        },

        // Getters
        get currentClock() {
            const d = new Date();
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        },
        get currentAppUrl() {
            if (typeof window !== 'undefined' && window.location && window.location.origin) {
                const path = window.location.pathname.replace(/\/+$/, '');
                return `${window.location.origin}${path}`;
            }
            return 'https://calculator.muliaabdi.net';
        },
        get parsedTotalPrice() {
            return this.parseNum(this.state.total_price);
        },
        get parsedTotalAmount() {
            return this.parseNum(this.state.total_ammount);
        },
        get isValidParameters() {
            return this.parsedTotalPrice > 0 && this.parsedTotalAmount > 0;
        },
        get sumMenuPrices() {
            return this.state.persons.reduce((acc, p) => acc + this.parseNum(p.price), 0);
        },
        get totalDiscountAmount() {
            if (!this.isValidParameters) return 0;
            return Math.max(0, this.parsedTotalPrice - this.parsedTotalAmount);
        },
        get discountPercentage() {
            if (!this.isValidParameters || this.parsedTotalPrice === 0) return 0;
            const pct = ((this.parsedTotalPrice - this.parsedTotalAmount) / this.parsedTotalPrice) * 100;
            return Math.round(pct);
        },
        get isSurchargeMode() {
            return this.isValidParameters && this.parsedTotalAmount > this.parsedTotalPrice;
        },
        get isDiscountMode() {
            return this.isValidParameters && this.parsedTotalAmount < this.parsedTotalPrice;
        },
        get totalSurchargeAmount() {
            if (!this.isValidParameters) return 0;
            return Math.max(0, this.parsedTotalAmount - this.parsedTotalPrice);
        },
        get surchargePercentage() {
            if (!this.isValidParameters || this.parsedTotalPrice === 0) return 0;
            const pct = ((this.parsedTotalAmount - this.parsedTotalPrice) / this.parsedTotalPrice) * 100;
            return Math.round(pct * 10) / 10;
        },
        get payRatioPercent() {
            if (!this.isValidParameters || this.parsedTotalPrice === 0) return 100;
            const ratio = (this.parsedTotalAmount / this.parsedTotalPrice) * 100;
            return Math.round(ratio * 10) / 10;
        },
        get totalAllocatedShare() {
            return this.state.persons.reduce((sum, p) => sum + this.calculatePersonShare(p), 0);
        },
        get roundingDifference() {
            if (!this.isValidParameters) return 0;
            return this.totalAllocatedShare - this.parsedTotalAmount;
        },
        get activePersons() {
            return this.state.persons.filter(p => this.parseNum(p.price) > 0);
        },

        // Selection & My Bill helpers
        togglePersonSelection(id) {
            if (this.selectedPersonIds.includes(id)) {
                this.selectedPersonIds = this.selectedPersonIds.filter(x => x !== id);
            } else {
                this.selectedPersonIds.push(id);
            }
        },
        selectAllPersons() {
            this.selectedPersonIds = this.state.persons.map(p => p.id);
        },
        clearPersonSelection() {
            this.selectedPersonIds = [];
        },
        get selectedPersons() {
            return this.state.persons.filter(p => this.selectedPersonIds.includes(p.id) && this.parseNum(p.price) > 0);
        },
        get selectedTotalMenuPrice() {
            return this.selectedPersons.reduce((sum, p) => sum + this.parseNum(p.price), 0);
        },
        get selectedTotalShare() {
            return this.selectedPersons.reduce((sum, p) => sum + this.calculatePersonShare(p), 0);
        },
        get selectedTotalExtra() {
            return Math.max(0, this.selectedTotalShare - this.selectedTotalMenuPrice);
        },
        get selectedTotalSaving() {
            return Math.max(0, this.selectedTotalMenuPrice - this.selectedTotalShare);
        },

        // Number helpers
        parseNum(val) {
            if (!val) return 0;
            const cleaned = val.toString().replace(/[^0-9]/g, '');
            return cleaned ? parseInt(cleaned, 10) : 0;
        },
        formatNumber(val) {
            if (val === null || val === undefined || val === '') return '0';
            const num = typeof val === 'number' ? Math.round(val) : this.parseNum(val);
            return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        },

        // Share calculation
        calculatePersonShare(person) {
            const price = this.parseNum(person.price);
            if (!price || !this.isValidParameters) return 0;
            const baseShare = Math.round((price / this.parsedTotalPrice) * this.parsedTotalAmount);
            return baseShare + (person.roundingAdjustment || 0);
        },
        calculatePersonSaving(person) {
            const price = this.parseNum(person.price);
            if (!price || !this.isValidParameters) return 0;
            const share = this.calculatePersonShare(person);
            return Math.max(0, price - share);
        },
        calculatePersonExtra(person) {
            const price = this.parseNum(person.price);
            if (!price || !this.isValidParameters) return 0;
            const share = this.calculatePersonShare(person);
            return Math.max(0, share - price);
        },

        // Row operations
        addRow() {
            if (this.isSharedBillView) return;
            const nextId = this.state.persons.length > 0 ? Math.max(...this.state.persons.map(p => p.id)) + 1 : 1;
            this.state.persons.push({
                id: nextId,
                name: `Orang ${this.state.persons.length + 1}`,
                price: null,
                roundingAdjustment: 0
            });
        },
        removeRow(index) {
            if (this.isSharedBillView) return;
            if (this.state.persons.length > 1) {
                this.state.persons.splice(index, 1);
            }
        },
        get splitModalTargetItem() {
            if (this.splitModalTargetIndex === null || !this.state.persons[this.splitModalTargetIndex]) return null;
            return this.state.persons[this.splitModalTargetIndex];
        },
        openSplitRowModal(index) {
            if (this.isSharedBillView) return;
            this.splitModalTargetIndex = index;
            this.splitModalCount = 2;
            this.showSplitModal = true;
        },
        closeSplitRowModal() {
            this.showSplitModal = false;
            this.splitModalTargetIndex = null;
        },
        confirmSplitRow() {
            if (this.isSharedBillView || this.splitModalTargetIndex === null) return;
            this.splitPersonRow(this.splitModalTargetIndex, this.splitModalCount);
            this.closeSplitRowModal();
        },
        splitPersonRow(index, count = 2) {
            if (this.isSharedBillView) return;
            const p = this.state.persons[index];
            if (!p) return;
            const price = this.parseNum(p.price);
            const n = Math.max(2, parseInt(count, 10) || 2);
            const baseUnit = Math.floor(price / n);
            let remainder = price - (baseUnit * n);
            const baseName = (p.name || '').replace(/\s*\(\d+(?:\/\d+)?\)$/, '').trim() || `Menu ${index + 1}`;

            const newPersons = [];
            const baseTime = Date.now();
            for (let q = 1; q <= n; q++) {
                const priceForThis = baseUnit + (remainder > 0 ? 1 : 0);
                if (remainder > 0) remainder--;
                newPersons.push({
                    id: baseTime + q,
                    name: `${baseName} (${q}/${n})`,
                    price: price > 0 ? this.formatNumber(priceForThis) : null,
                    roundingAdjustment: 0
                });
            }

            this.state.persons.splice(index, 1, ...newPersons);
            this.saveToStorage();
            this.showToast(this.t('splitSuccessToast') || `Menu berhasil dibagi ke ${n} orang!`);
        },

        // Input handling
        numberOnly(evt) {
            const charCode = evt.which ? evt.which : evt.keyCode;
            if (charCode > 31 && (charCode < 48 || charCode > 57)) {
                evt.preventDefault();
            }
        },
        onFormatInput(evt, targetObj, key) {
            const raw = evt.target.value.replace(/[^0-9]/g, '');
            if (!raw) {
                targetObj[key] = null;
                evt.target.value = '';
                return;
            }
            const formatted = this.formatNumber(parseInt(raw, 10));
            targetObj[key] = formatted;
            evt.target.value = formatted;
            if (key === 'price') {
                targetObj.roundingAdjustment = 0;
            }
        },
        applySumAsOriginalPrice() {
            if (this.sumMenuPrices > 0) {
                this.state.total_price = this.formatNumber(this.sumMenuPrices);
                this.showToast(`Total struk diset ke Rp ${this.formatNumber(this.sumMenuPrices)}`);
            }
        },
        autoFixRounding() {
            if (this.roundingDifference === 0 || this.state.persons.length === 0) return;
            const target = this.state.persons.find(p => this.parseNum(p.price) > 0) || this.state.persons[0];
            if (target) {
                target.roundingAdjustment = (target.roundingAdjustment || 0) - this.roundingDifference;
                this.showToast('Selisih pembulatan berhasil dipaskan!');
                if (typeof confetti === 'function') {
                    confetti({ particleCount: 30, spread: 60, origin: { y: 0.8 } });
                }
            }
        },

        // Storage
        saveToStorage() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
            } catch (e) {
                console.error('Storage error', e);
            }
        },
        loadFromStorage() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed && Array.isArray(parsed.persons)) {
                        this.state.persons = parsed.persons;
                        this.state.total_price = parsed.total_price || null;
                        this.state.total_ammount = parsed.total_ammount || null;
                        this.state.payment_info = parsed.payment_info || '';
                    }
                }
            } catch (e) {
                console.error('Load storage error', e);
            }
        },

        // Stats
        async loadStats() {
            try {
                const raw = localStorage.getItem(STATS_KEY);
                if (raw) {
                    const data = JSON.parse(raw);
                    this.stats.totalBilled = Math.max(this.stats.totalBilled, Number(data.totalBilled) || 0);
                    this.stats.totalSaved = Math.max(this.stats.totalSaved, Number(data.totalSaved) || 0);
                    this.stats.count = Math.max(this.stats.count, Number(data.count) || 0);
                }
            } catch (e) { }

            try {
                const res = await fetch(KV_URL);
                if (res.ok) {
                    const cloudData = await res.json();
                    if (cloudData && typeof cloudData === 'object') {
                        this.stats.totalBilled = Number(cloudData.totalBilled) || this.stats.totalBilled;
                        this.stats.totalSaved = Number(cloudData.totalSaved) || this.stats.totalSaved;
                        this.stats.count = Number(cloudData.count) || this.stats.count;
                        localStorage.setItem(STATS_KEY, JSON.stringify(this.stats));
                    }
                }
            } catch (err) { }
        },
        async saveStats() {
            try {
                localStorage.setItem(STATS_KEY, JSON.stringify(this.stats));
            } catch (e) { }

            try {
                await fetch(KV_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        totalBilled: this.stats.totalBilled,
                        totalSaved: this.stats.totalSaved,
                        count: this.stats.count
                    })
                });
            } catch (err) { }
        },
        recordCalculation() {
            if (!this.isValidParameters) return;
            const billed = this.parsedTotalAmount;
            const saved = this.totalDiscountAmount;
            const hash = `${this.parsedTotalPrice}-${billed}`;
            if (hash !== this.lastRecordedHash && billed > 0) {
                this.lastRecordedHash = hash;
                this.stats.totalBilled += billed;
                this.stats.totalSaved += saved;
                this.stats.count += 1;
                this.saveStats();
            }
        },

        // Reset
        resetAll() {
            if (confirm(this.t('resetConfirm'))) {
                this.state.persons = [
                    { id: 1, name: this.lang === 'en' ? 'Person 1' : 'Orang 1', price: null, roundingAdjustment: 0 },
                    { id: 2, name: this.lang === 'en' ? 'Person 2' : 'Orang 2', price: null, roundingAdjustment: 0 }
                ];
                this.state.total_price = null;
                this.state.total_ammount = null;
                this.saveToStorage();
                this.showToast(this.t('resetToast'));
            }
        },

        // Copy app URL
        async copyAppUrl() {
            try {
                await navigator.clipboard.writeText(this.currentAppUrl);
                this.showToast(this.t('linkCopiedToast'));
                if (typeof confetti === 'function') {
                    confetti({ particleCount: 30, spread: 60, origin: { y: 0.8 } });
                }
            } catch (e) {
                this.showToast('Link: ' + this.currentAppUrl);
            }
        },

        // WhatsApp message generator
        generateWhatsAppMessage() {
            const lines = [];
            const url = this.currentAppUrl;
            const isEn = this.lang === 'en';

            lines.push(isEn ? '*FOOD BILL SPLIT DETAILS*' : '*RINCIAN PATUNGAN MAKANAN*');
            lines.push('─────────────────────────────');

            if (this.parsedTotalPrice && this.parsedTotalAmount) {
                lines.push(isEn ? '*Bill Summary:*' : '*Ringkasan Tagihan:*');
                lines.push(`• ${isEn ? 'Original Menu' : 'Total Menu Asli'} : Rp ${this.formatNumber(this.parsedTotalPrice)}`);
                lines.push(`• ${isEn ? 'Amount Paid' : 'Total Dibayar'}   : *Rp ${this.formatNumber(this.parsedTotalAmount)}*`);
                if (this.isSurchargeMode) {
                    lines.push(`• ${isEn ? 'Tax & Service' : 'Pajak & Service'}  : *+Rp ${this.formatNumber(this.totalSurchargeAmount)} (+${this.surchargePercentage}%)*`);
                } else if (this.totalDiscountAmount > 0) {
                    lines.push(`• ${isEn ? 'Discount Savings' : 'Hemat Diskon'}    : *Rp ${this.formatNumber(this.totalDiscountAmount)} (${this.discountPercentage}% OFF)*`);
                }
                lines.push('─────────────────────────────');
            }

            lines.push(isEn ? '*Payment Breakdown per Person:*' : '*Rincian Bayar per Orang:*');
            let count = 0;

            this.state.persons.forEach((p, idx) => {
                const price = this.parseNum(p.price);
                if (price > 0) {
                    count++;
                    const share = this.calculatePersonShare(p);
                    const saving = this.calculatePersonSaving(p);
                    const defaultName = isEn ? `Person ${idx + 1}` : `Orang ${idx + 1}`;
                    const name = p.name ? p.name.trim() : defaultName;

                    const labelMenu = isEn ? 'Menu Price ' : 'Harga Menu ';
                    const labelDisc = isEn ? 'Discount   ' : 'Diskon     ';
                    const labelPay = isEn ? 'Net Pay    ' : 'Bayar      ';

                    lines.push(`\n${count}. *${name}*`);
                    lines.push(`   ├ ${labelMenu}: Rp ${this.formatNumber(price)}`);
                    if (this.isSurchargeMode) {
                        const extra = Math.max(0, share - price);
                        if (extra > 0) {
                            const labelExtra = isEn ? 'Tax/Service ' : 'Pajak/Serv ';
                            lines.push(`   ├ ${labelExtra}: +Rp ${this.formatNumber(extra)}`);
                        }
                    } else if (saving > 0) {
                        lines.push(`   ├ ${labelDisc}: Rp ${this.formatNumber(saving)}`);
                    }
                    lines.push(`   └ *${labelPay}: Rp ${this.formatNumber(share)}*`);
                }
            });

            lines.push('\n─────────────────────────────');
            lines.push(`*${isEn ? 'TOTAL BILLED' : 'TOTAL DITAGIH'} : Rp ${this.formatNumber(this.totalAllocatedShare)}*`);

            if (this.state.payment_info && this.state.payment_info.trim()) {
                lines.push('\n─────────────────────────────');
                lines.push(isEn ? '*Payment / Transfer Info:*' : '*Info Pembayaran / Transfer:*');
                lines.push(this.state.payment_info.trim());
            }

            lines.push('\n─────────────────────────────');
            lines.push(isEn ? '👉 *Pick your dishes & calculate personal share here:*' : '👉 *Pilih menu & hitung bagianmu di sini:*');
            lines.push(this.shareableBillLink);
            lines.push('\n─────────────────────────────');
            lines.push((isEn ? '_Calculated with:_ ' : '_Dihitung via:_ ') + url);

            return lines.join('\n');
        },

        // Bill link encoding and sharing
        encodeBillPayload(obj) {
            try {
                const str = JSON.stringify(obj);
                return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
                    return String.fromCharCode('0x' + p1);
                })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            } catch (e) {
                return '';
            }
        },
        decodeBillPayload(encoded) {
            try {
                let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
                while (b64.length % 4) b64 += '=';
                const str = decodeURIComponent(Array.prototype.map.call(atob(b64), (c) => {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                }).join(''));
                return JSON.parse(str);
            } catch (e) {
                return null;
            }
        },
        get shareableBillLink() {
            const hasData = (this.state.total_price || this.state.total_ammount) || 
                            this.state.persons.some(p => this.parseNum(p.price) > 0);
            if (!hasData) {
                return this.currentAppUrl;
            }
            const payload = {
                tp: this.state.total_price || '',
                ta: this.state.total_ammount || '',
                pi: this.state.payment_info || '',
                m: this.state.persons
                    .filter(p => this.parseNum(p.price) > 0 || (p.name && p.name.trim()))
                    .map(p => ({
                        n: p.name || '',
                        p: p.price || ''
                    }))
            };
            const encoded = this.encodeBillPayload(payload);
            const base = (typeof window !== 'undefined' && window.location) 
                ? (window.location.origin + window.location.pathname) 
                : this.currentAppUrl;
            return `${base}#bill=${encoded}`;
        },
        checkSharedLink() {
            if (typeof window === 'undefined' || !window.location) return;
            let rawParam = '';
            if (window.location.hash && window.location.hash.includes('bill=')) {
                rawParam = window.location.hash.split('bill=')[1]?.split('&')[0];
            } else if (window.location.search && window.location.search.includes('bill=')) {
                const sp = new URLSearchParams(window.location.search);
                rawParam = sp.get('bill');
            }
            if (!rawParam) return;

            const data = this.decodeBillPayload(rawParam);
            if (data && (data.tp || data.ta || (Array.isArray(data.m) && data.m.length > 0))) {
                this.isSharedBillView = true;
                this.lockedBillPayload = {
                    tp: data.tp || '',
                    ta: data.ta || '',
                    pi: data.pi || '',
                    m: (data.m || []).map(it => ({ n: it.n || '', p: it.p || '' }))
                };
                if (data.tp) this.state.total_price = data.tp;
                if (data.ta) this.state.total_ammount = data.ta;
                if (data.pi) this.state.payment_info = data.pi;
                if (Array.isArray(data.m) && data.m.length > 0) {
                    this.state.persons = data.m.map((it, idx) => ({
                        id: idx + 1,
                        name: it.n || (this.lang === 'en' ? `Item ${idx + 1}` : `Menu ${idx + 1}`),
                        price: it.p || null,
                        roundingAdjustment: 0
                    }));
                }
                this.selectedPersonIds = [];
                this.showToast(this.t('sharedBillLoadedToast') || 'Tagihan bersama berhasil dimuat! Silakan centang menumu.');
            }
        },
        async copyShareLink() {
            this.recordCalculation();
            try {
                await navigator.clipboard.writeText(this.shareableBillLink);
                this.linkCopied = true;
                this.showToast(this.t('linkCopiedSuccess') || 'Tautan berhasil disalin!');
                if (typeof confetti === 'function') {
                    confetti({ particleCount: 30, spread: 60, origin: { y: 0.6 } });
                }
                setTimeout(() => {
                    this.linkCopied = false;
                }, 2500);
            } catch (e) {
                this.showToast(this.shareableBillLink);
            }
        },
        openWhatsAppWithLink() {
            this.recordCalculation();
            const isEn = this.lang === 'en';
            const msg = isEn 
                ? `Hi! Here is our food bill split link. Tap the link to check your dishes & calculate your exact share:\n${this.shareableBillLink}`
                : `Halo! Ini link rincian patungan makan kita. Yuk klik link ini untuk centang menu kamu & hitung jumlah transfernya:\n${this.shareableBillLink}`;
            window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
        },
        resetToNewBill() {
            if (typeof window !== 'undefined' && window.history && window.location) {
                history.replaceState(null, '', window.location.pathname);
            }
            this.isSharedBillView = false;
            this.lockedBillPayload = null;
            this.selectedPersonIds = [];
            this.resetCalculation();
        },

        // My Bill message generator & copier
        generateMyBillMessage() {
            const isEn = this.lang === 'en';
            const lines = [];
            const url = this.currentAppUrl;

            lines.push(isEn ? '*MY FOOD BILL SHARE*' : '*RINCIAN TAGIHAN SAYA*');
            lines.push('─────────────────────────────');
            this.selectedPersons.forEach((p, i) => {
                const price = this.parseNum(p.price);
                const share = this.calculatePersonShare(p);
                lines.push(`${i + 1}. *${p.name || ((isEn ? 'Item ' : 'Menu ') + (i + 1))}*`);
                lines.push(`   ├ ${isEn ? 'Price' : 'Harga'}: Rp ${this.formatNumber(price)}`);
                lines.push(`   └ *${isEn ? 'Pay' : 'Bayar'}: Rp ${this.formatNumber(share)}*`);
            });
            lines.push('─────────────────────────────');
            lines.push(`• ${isEn ? 'My Menu Total' : 'Total Menu Saya'} : Rp ${this.formatNumber(this.selectedTotalMenuPrice)}`);
            if (this.isSurchargeMode) {
                lines.push(`• ${isEn ? 'Tax & Service' : 'Pajak & Service'}  : *+Rp ${this.formatNumber(this.selectedTotalExtra)} (+${this.surchargePercentage}%)*`);
            } else if (this.isDiscountMode) {
                lines.push(`• ${isEn ? 'Discount' : 'Hemat Diskon'}     : *Rp ${this.formatNumber(this.selectedTotalSaving)} (${this.discountPercentage}% OFF)*`);
            }
            lines.push(`• *${isEn ? 'NET PAYABLE' : 'TOTAL SAYA BAYAR'} : Rp ${this.formatNumber(this.selectedTotalShare)}*`);

            if (this.state.payment_info && this.state.payment_info.trim()) {
                lines.push('─────────────────────────────');
                lines.push(isEn ? '*Transfer to:*' : '*Transfer ke:*');
                lines.push(this.state.payment_info.trim());
            }

            lines.push('─────────────────────────────');
            lines.push((isEn ? '_Calculated with:_ ' : '_Dihitung via:_ ') + url);

            return lines.join('\n');
        },
        async copyMyBill() {
            const text = this.generateMyBillMessage();
            try {
                await navigator.clipboard.writeText(text);
                this.showToast(this.t('myBillCopiedToast') || 'Rincian tagihan kamu berhasil disalin!');
                if (typeof confetti === 'function') {
                    confetti({ particleCount: 35, spread: 60, origin: { y: 0.8 } });
                }
            } catch (e) {
                this.showToast('Gagal menyalin teks');
            }
        },

        async copyPaymentInfo() {
            if (!this.state.payment_info) return;
            try {
                await navigator.clipboard.writeText(this.state.payment_info);
                this.showToast(this.t('paymentInfoCopied', 'Info rekening/pembayaran berhasil disalin!'));
                if (typeof confetti === 'function') {
                    confetti({ particleCount: 30, spread: 50, origin: { y: 0.7 } });
                }
            } catch (e) {
                this.showToast('Gagal menyalin info pembayaran');
            }
        },

        // Share modal actions
        openShareModal() {
            this.recordCalculation();
            this.showShareModal = true;
            this.copied = false;
        },
        async copyToClipboard() {
            this.recordCalculation();
            const text = this.generateWhatsAppMessage();
            try {
                await navigator.clipboard.writeText(text);
                this.copied = true;
                this.showToast('Teks berhasil disalin ke clipboard!');
                if (typeof confetti === 'function') {
                    confetti({ particleCount: 40, spread: 70, origin: { y: 0.6 } });
                }
                setTimeout(() => {
                    this.copied = false;
                }, 2500);
            } catch (err) {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                this.copied = true;
                this.showToast('Teks berhasil disalin!');
            }
        },
        openWhatsAppDirect() {
            this.recordCalculation();
            const text = encodeURIComponent(this.generateWhatsAppMessage());
            window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
        },

        // Image receipt export via html2canvas
        async copyImageReceipt() {
            const el = document.getElementById('receipt-card');
            if (!el || typeof html2canvas !== 'function') {
                this.showToast('Fitur gambar belum siap');
                return;
            }
            this.copyingImage = true;
            try {
                const h2cOptions = {
                    scale: 3,
                    backgroundColor: '#DCF8C6',
                    useCORS: true,
                    logging: false,
                    scrollY: 0,
                    scrollX: 0,
                    onclone: (clonedDoc) => {
                        const clonedEl = clonedDoc.getElementById('receipt-card');
                        if (clonedEl) {
                            clonedEl.style.overflow = 'visible';
                            let parent = clonedEl.parentElement;
                            while (parent && parent !== clonedDoc.body) {
                                parent.style.overflow = 'visible';
                                parent.style.maxHeight = 'none';
                                parent.style.height = 'auto';
                                parent = parent.parentElement;
                            }
                        }
                    }
                };
                const canvas = await html2canvas(el, h2cOptions);

                canvas.toBlob(async (blob) => {
                    if (!blob) {
                        this.showToast('Gagal memproses gambar');
                        this.copyingImage = false;
                        return;
                    }
                    try {
                        if (navigator.clipboard && window.ClipboardItem && navigator.clipboard.write) {
                            await navigator.clipboard.write([
                                new ClipboardItem({ 'image/png': blob })
                            ]);
                            this.showToast('Gambar struk tersalin! Paste (Ctrl+V) langsung di WA');
                        } else {
                            const link = document.createElement('a');
                            link.download = 'struk-patungan.png';
                            link.href = canvas.toDataURL('image/png');
                            link.click();
                            this.showToast('Gambar struk diunduh ke galeri/file');
                        }
                        if (typeof confetti === 'function') {
                            confetti({ particleCount: 35, spread: 60, origin: { y: 0.6 } });
                        }
                    } catch (err) {
                        const link = document.createElement('a');
                        link.download = 'struk-patungan.png';
                        link.href = canvas.toDataURL('image/png');
                        link.click();
                        this.showToast('Gambar struk diunduh!');
                    } finally {
                        this.copyingImage = false;
                    }
                }, 'image/png');
            } catch (err) {
                console.error(err);
                this.copyingImage = false;
                this.showToast('Gagal membuat gambar struk');
            }
        },
        async downloadImageReceipt() {
            const el = document.getElementById('receipt-card');
            if (!el || typeof html2canvas !== 'function') {
                this.showToast('Fitur gambar belum siap');
                return;
            }
            this.copyingImage = true;
            try {
                const h2cOptions = {
                    scale: 3,
                    backgroundColor: '#DCF8C6',
                    useCORS: true,
                    logging: false,
                    scrollY: 0,
                    scrollX: 0,
                    onclone: (clonedDoc) => {
                        const clonedEl = clonedDoc.getElementById('receipt-card');
                        if (clonedEl) {
                            clonedEl.style.overflow = 'visible';
                            let parent = clonedEl.parentElement;
                            while (parent && parent !== clonedDoc.body) {
                                parent.style.overflow = 'visible';
                                parent.style.maxHeight = 'none';
                                parent.style.height = 'auto';
                                parent = parent.parentElement;
                            }
                        }
                    }
                };
                const canvas = await html2canvas(el, h2cOptions);
                const link = document.createElement('a');
                link.download = 'struk-patungan.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
                this.showToast('Gambar struk berhasil diunduh!');
                if (typeof confetti === 'function') {
                    confetti({ particleCount: 35, spread: 60, origin: { y: 0.6 } });
                }
            } catch (err) {
                console.error(err);
                this.showToast('Gagal mengunduh gambar');
            } finally {
                this.copyingImage = false;
            }
        },

        // Global Paste Listener (Ctrl+V / Cmd+V)
        setupGlobalPasteListener() {
            window.addEventListener('paste', async (e) => {
                const active = document.activeElement;
                if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
                    return;
                }

                // Cek gambar di clipboard
                const items = (e.clipboardData || window.clipboardData)?.items;
                if (items) {
                    for (let i = 0; i < items.length; i++) {
                        if (items[i].type && items[i].type.startsWith('image/')) {
                            e.preventDefault();
                            const blob = items[i].getAsFile();
                            if (blob) {
                                this.processReceiptBlob(blob);
                                this.showToast(this.t('pastedImageSuccess'));
                                return;
                            }
                        }
                    }
                }

                // Cek teks struk di clipboard
                const pastedText = (e.clipboardData || window.clipboardData)?.getData('text');
                if (pastedText && pastedText.trim().length > 5) {
                    if (pastedText.includes('\n') || /(?:total|subtotal|rp|\d+[\.,]\d{3})/i.test(pastedText)) {
                        e.preventDefault();
                        this.handlePastedReceiptText(pastedText);
                        this.showToast(this.t('pastedTextSuccess'));
                    }
                }
            });
        },

        // OCR & Receipt Processing methods
        processReceiptBlob(blob) {
            if (!blob) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                this.ocrPreviewUrl = e.target.result;
                this.showScanPickerModal = false;
                this.showOcrModal = true;
                this.ocrScanning = true;
                this.ocrProgress = 5;
                this.ocrStatus = this.t('ocrOptimizing');
                this.ocrTab = 'result';
                this.ocrResult = {
                    subtotal: null,
                    total: null,
                    items: [],
                    rawText: ''
                };

                try {
                    await this.processOcrImage(this.ocrPreviewUrl);
                } catch (err) {
                    console.error('OCR Error:', err);
                    this.ocrScanning = false;
                    this.ocrStatus = this.t('ocrFailed');
                    this.showToast(this.t('ocrFailed'));
                }
            };
            reader.readAsDataURL(blob);
        },

        async handleReceiptImageUpload(evt) {
            const file = evt.target.files && evt.target.files[0];
            if (!file) return;
            evt.target.value = '';
            this.processReceiptBlob(file);
        },

        async pasteReceiptFromClipboard() {
            this.showScanPickerModal = false;
            if (navigator.clipboard) {
                // 1. Coba baca gambar dari clipboard
                if (navigator.clipboard.read) {
                    try {
                        const items = await navigator.clipboard.read();
                        for (const item of items) {
                            const imgType = item.types.find(t => t.startsWith('image/'));
                            if (imgType) {
                                const blob = await item.getType(imgType);
                                this.processReceiptBlob(blob);
                                this.showToast(this.t('pastedImageSuccess'));
                                return;
                            }
                        }
                    } catch (e) { }
                }

                // 2. Coba baca teks dari clipboard
                if (navigator.clipboard.readText) {
                    try {
                        const text = await navigator.clipboard.readText();
                        if (text && text.trim().length > 0) {
                            this.handlePastedReceiptText(text);
                            this.showToast(this.t('pastedTextSuccess'));
                            return;
                        }
                    } catch (e) { }
                }
            }

            // Fallback: buka modal teks struk manual
            this.openManualPasteModal();
        },

        handlePastedReceiptText(text) {
            if (!text || !text.trim()) {
                this.showToast(this.t('clipboardEmpty'));
                return;
            }
            this.ocrPreviewUrl = null;
            this.showScanPickerModal = false;
            this.showOcrModal = true;
            this.ocrScanning = false;
            this.ocrProgress = 100;
            this.ocrTab = 'result';

            const parsed = OCR.parseReceiptText(text, this.formatNumber.bind(this));
            this.ocrResult = parsed;

            if (parsed.items.length === 0 && !parsed.total && !parsed.subtotal) {
                this.ocrStatus = this.t('ocrNoItems');
                this.ocrTab = 'raw';
            } else {
                this.ocrStatus = `${this.t('ocrSuccess')} ${parsed.items.length} ${this.t('ocrItemsCount')}`;
                this.showToast(`${this.t('ocrSuccess')} ${parsed.items.length} ${this.t('ocrItemsCount')}`);
            }
        },

        openManualPasteModal() {
            this.showScanPickerModal = false;
            this.ocrPreviewUrl = null;
            this.showOcrModal = true;
            this.ocrScanning = false;
            this.ocrProgress = 100;
            this.ocrStatus = this.t('pasteTextInstruction');
            this.ocrTab = 'raw';
            if (!this.ocrResult) {
                this.ocrResult = { subtotal: null, total: null, items: [], rawText: '' };
            }
            this.$nextTick(() => {
                const el = document.querySelector('textarea[x-model="ocrResult.rawText"]');
                if (el) el.focus();
            });
        },

        async pasteIntoRawTextarea() {
            if (navigator.clipboard && navigator.clipboard.readText) {
                try {
                    const text = await navigator.clipboard.readText();
                    if (text && text.trim()) {
                        this.ocrResult.rawText = text;
                        this.reparseRawText();
                        return;
                    }
                } catch (e) { }
            }
            this.showToast(this.t('clipboardDenied'));
        },

        async processOcrImage(rawUrl) {
            this.ocrStatus = this.t('ocrOptimizing');
            this.ocrProgress = 15;
            const processedUrl = await OCR.preprocessImage(rawUrl);

            this.ocrStatus = this.t('ocrModuleReady');
            this.ocrProgress = 25;
            const Tesseract = await OCR.loadTesseract();

            this.ocrStatus = this.t('ocrReadingText');
            const result = await Tesseract.recognize(processedUrl, 'ind+eng', {
                logger: (m) => {
                    if (m.status === 'recognizing text') {
                        this.ocrProgress = 25 + Math.round(m.progress * 70);
                        this.ocrStatus = `${this.t('ocrReadingProgress')} (${Math.round(m.progress * 100)}%)...`;
                    }
                }
            });

            this.ocrProgress = 100;
            this.ocrScanning = false;
            const text = result && result.data && result.data.text ? result.data.text : '';
            this.ocrResult = OCR.parseReceiptText(text, this.formatNumber.bind(this));

            if (this.ocrResult.items.length === 0 && !this.ocrResult.total && !this.ocrResult.subtotal) {
                this.ocrStatus = this.t('ocrNoItems');
            } else {
                this.ocrStatus = `${this.t('ocrSuccess')} ${this.ocrResult.items.length} ${this.t('ocrItemsCount')}`;
                this.showToast(`${this.t('ocrSuccess')} ${this.ocrResult.items.length} ${this.t('ocrItemsCount')}`);
            }
        },

        reparseRawText() {
            if (!this.ocrResult || !this.ocrResult.rawText) return;
            const parsed = OCR.parseReceiptText(this.ocrResult.rawText, this.formatNumber.bind(this));
            this.ocrResult.subtotal = parsed.subtotal;
            this.ocrResult.total = parsed.total;
            this.ocrResult.surcharges = parsed.surcharges || [];
            this.ocrResult.totalSurcharges = parsed.totalSurcharges || 0;
            this.ocrResult.discounts = parsed.discounts || [];
            this.ocrResult.totalDiscounts = parsed.totalDiscounts || 0;
            this.ocrResult.items = parsed.items;
            this.ocrTab = 'result';
            this.ocrStatus = `${this.t('ocrSuccess')} ${parsed.items.length} ${this.t('ocrItemsCount')}`;
            this.showToast(`${this.t('ocrSuccess')} ${parsed.items.length} ${this.t('ocrItemsCount')}`);
        },

        addOcrItem() {
            this.ocrResult.items.push({
                name: `Menu ${this.ocrResult.items.length + 1}`,
                price: '0',
                qty: 1
            });
        },
        removeOcrItem(idx) {
            this.ocrResult.items.splice(idx, 1);
        },
        splitOcrItem(idx) {
            const item = this.ocrResult.items[idx];
            if (!item) return;
            const qty = Math.max(1, parseInt(item.qty, 10) || 1);
            if (qty <= 1) return;

            const totalPrice = this.parseNum(item.price);
            const baseUnit = Math.floor(totalPrice / qty);
            let remainder = totalPrice - (baseUnit * qty);

            const newItems = [];
            for (let q = 1; q <= qty; q++) {
                const priceForThis = baseUnit + (remainder > 0 ? 1 : 0);
                if (remainder > 0) remainder--;
                newItems.push({
                    name: `${item.name} (${q})`,
                    price: this.formatNumber(priceForThis),
                    qty: 1
                });
            }

            this.ocrResult.items.splice(idx, 1, ...newItems);
            this.showToast(this.t('splitSuccessToast') || 'Menu berhasil dipecah!');
        },

        applyOcrToCalculator() {
            if (this.ocrResult.subtotal) {
                this.state.total_price = this.ocrResult.subtotal;
            } else if (this.ocrResult.items.length > 0) {
                const sum = this.ocrResult.items.reduce((acc, it) => acc + this.parseNum(it.price), 0);
                if (sum > 0) this.state.total_price = this.formatNumber(sum);
            }

            if (this.ocrResult.total) {
                this.state.total_ammount = this.ocrResult.total;
            }

            if (this.ocrResult.items.length > 0) {
                const baseTime = Date.now();
                const expanded = [];

                this.ocrResult.items.forEach((it) => {
                    const qty = Math.max(1, parseInt(it.qty, 10) || 1);
                    const totalPrice = this.parseNum(it.price);

                    if (this.ocrAutoSplitQty && qty > 1 && totalPrice > 0) {
                        const baseUnit = Math.floor(totalPrice / qty);
                        let remainder = totalPrice - (baseUnit * qty);
                        for (let q = 1; q <= qty; q++) {
                            const priceForThis = baseUnit + (remainder > 0 ? 1 : 0);
                            if (remainder > 0) remainder--;
                            expanded.push({
                                name: `${it.name || 'Menu'} (${q})`,
                                price: this.formatNumber(priceForThis)
                            });
                        }
                    } else {
                        expanded.push({
                            name: (it.qty > 1 && !this.ocrAutoSplitQty) ? `${it.name || 'Menu'} (${it.qty}x)` : (it.name || ''),
                            price: it.price
                        });
                    }
                });

                this.state.persons = expanded.map((it, idx) => ({
                    id: baseTime + idx,
                    name: it.name || `Orang ${idx + 1}`,
                    price: it.price,
                    roundingAdjustment: 0
                }));
            }

            this.saveToStorage();
            this.showOcrModal = false;
            this.showToast(this.t('ocrAppliedToast'));
            if (typeof confetti === 'function') {
                confetti({ particleCount: 45, spread: 70, origin: { y: 0.5 } });
            }
        }
    };
}

window.calculator = calculator;
