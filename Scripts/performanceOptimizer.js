/* =====================================================================
    Performance Optimization Utilities
===================================================================== */

// Device performance detection
export class DevicePerformance {
    static isLowEndDevice() {
        // Check various performance indicators
        const checks = [
            navigator.hardwareConcurrency < 4,
            navigator.deviceMemory && navigator.deviceMemory < 4,
            window.screen.width < 1024,
            /Android.*; wv\)|iPhone|iPad|iPod/i.test(navigator.userAgent)
        ];
        
        return checks.filter(Boolean).length >= 2;
    }

    static getDeviceCategory() {
        if (this.isLowEndDevice()) return 'low';
        if (navigator.hardwareConcurrency >= 8) return 'high';
        return 'medium';
    }
}

// Optimized image URL generator
export function getOptimizedImageUrl(originalUrl, options = {}) {
    if (!originalUrl || !originalUrl.includes('communitydragon.org')) {
        return originalUrl;
    }

    const deviceCategory = DevicePerformance.getDeviceCategory();
    const isRetina = window.devicePixelRatio > 1;
    
    // Size mapping based on device performance
    const sizeMap = {
        low: { width: 32, quality: 60 },
        medium: { width: isRetina ? 64 : 48, quality: 75 },
        high: { width: isRetina ? 96 : 64, quality: 85 }
    };

    const config = sizeMap[deviceCategory];
    const params = new URLSearchParams();
    
    params.set('w', options.width || config.width);
    if (config.quality) params.set('q', config.quality);
    
    // Add webp format for better compression
    if (supportsWebP()) {
        params.set('f', 'webp');
    }

    return `${originalUrl.split('?')[0]}?${params.toString()}`;
}

// WebP support detection
let webpSupported = null;
function supportsWebP() {
    if (webpSupported !== null) return webpSupported;
    
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    webpSupported = canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    return webpSupported;
}

// Performance-aware Intersection Observer
export function createPerformanceObserver(callback, options = {}) {
    const defaultOptions = {
        rootMargin: DevicePerformance.isLowEndDevice() ? '50px' : '100px',
        threshold: 0.1
    };

    return new IntersectionObserver(callback, { ...defaultOptions, ...options });
}

// Request queue for limiting concurrent requests
export class RequestQueue {
    constructor(maxConcurrent = 6) {
        this.maxConcurrent = DevicePerformance.isLowEndDevice() ? 3 : maxConcurrent;
        this.queue = [];
        this.running = 0;
    }

    async add(requestFn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ requestFn, resolve, reject });
            this.process();
        });
    }

    async process() {
        if (this.running >= this.maxConcurrent || this.queue.length === 0) {
            return;
        }

        this.running++;
        const { requestFn, resolve, reject } = this.queue.shift();

        try {
            const result = await requestFn();
            resolve(result);
        } catch (error) {
            reject(error);
        } finally {
            this.running--;
            this.process();
        }
    }
}

// Global request queue instance
export const imageRequestQueue = new RequestQueue();

// Memory management utilities
export function cleanupUnusedImages() {
    const images = document.querySelectorAll('img[src*="communitydragon.org"]');
    const viewportHeight = window.innerHeight;
    
    images.forEach(img => {
        const rect = img.getBoundingClientRect();
        const isOutOfViewport = rect.bottom < -viewportHeight || rect.top > viewportHeight * 2;
        
        if (isOutOfViewport && img.src && !img.dataset.src) {
            // Move src to data-src for lazy loading later
            img.dataset.src = img.src;
            img.src = '';
            img.classList.add('lazy');
        }
    });
}

// Performance monitoring
export function measurePerformance(name, fn) {
    return async function(...args) {
        const start = performance.now();
        try {
            const result = await fn.apply(this, args);
            const end = performance.now();
            console.log(`⚡ ${name}: ${(end - start).toFixed(2)}ms`);
            return result;
        } catch (error) {
            const end = performance.now();
            console.error(`❌ ${name} failed after ${(end - start).toFixed(2)}ms:`, error);
            throw error;
        }
    };
}

// Throttle scroll events for performance
export function createThrottledScroll(callback, delay = 16) {
    let ticking = false;
    
    return function(...args) {
        if (!ticking) {
            requestAnimationFrame(() => {
                callback.apply(this, args);
                ticking = false;
            });
            ticking = true;
        }
    };
}
