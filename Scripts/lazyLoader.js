/* =====================================================================
    Lazy Loading and Performance Utilities
===================================================================== */

import { createPerformanceObserver, getOptimizedImageUrl, DevicePerformance, imageRequestQueue } from './performanceOptimizer.js';

const isLowEndDevice = DevicePerformance.isLowEndDevice();

// Lazy load images when they come into viewport
export function initializeLazyLoading() {
    const imageObserver = createPerformanceObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                const src = img.dataset.src || img.src;
                
                // Queue image loading to prevent overwhelming the browser
                imageRequestQueue.add(async () => {
                    return new Promise((resolve, reject) => {
                        const tempImg = new Image();
                        tempImg.onload = () => {
                            if (src && src.includes('?w=')) {
                                // Apply performance-aware image sizing
                                img.src = getOptimizedImageUrl(src.split('?w=')[0]);
                            } else if (img.dataset.src) {
                                img.src = getOptimizedImageUrl(img.dataset.src);
                            }
                            img.classList.remove('lazy');
                            resolve();
                        };
                        tempImg.onerror = reject;
                        tempImg.src = src && src.includes('?w=') ? 
                            getOptimizedImageUrl(src.split('?w=')[0]) : 
                            getOptimizedImageUrl(src);
                    });
                }).then(() => {
                    observer.unobserve(img);
                }).catch(error => {
                    console.warn('Failed to load image:', src, error);
                    observer.unobserve(img);
                });
            }
        });
    });

    // Observe all images with lazy class
    document.querySelectorAll('img.lazy').forEach(img => {
        imageObserver.observe(img);
    });

    return imageObserver;
}

// Optimize image loading for performance
export function optimizeImageLoading() {
    // Apply performance-aware sizing to all unit and item images
    const images = document.querySelectorAll('img[src*="communitydragon.org"]');
    
    images.forEach(img => {
        if (img.src.includes('?w=')) return; // Already optimized
        
        const optimizedSrc = getOptimizedImageUrl(img.src);
        if (optimizedSrc !== img.src) {
            img.src = optimizedSrc;
        }
    });
}

// Debounced scroll handler for performance
let scrollTimeout;
export function handlePerformanceScroll(callback) {
    return function(event) {
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
        }
        
        scrollTimeout = setTimeout(() => {
            callback(event);
        }, isLowEndDevice ? 100 : 50);
    };
}

// Reduce quality for background images on low-end devices
export function optimizeBackgroundImages() {
    if (!isLowEndDevice) return;
    
    const elementsWithBg = document.querySelectorAll('[style*="background-image"]');
    elementsWithBg.forEach(el => {
        const style = el.style.backgroundImage;
        if (style && style.includes('url(')) {
            const url = style.match(/url\(['"]?([^'"]*)/)[1];
            const optimizedUrl = getOptimizedImageUrl(url);
            el.style.backgroundImage = `url("${optimizedUrl}")`;
        }
    });
}

// Batch DOM operations for better performance
export function batchDOMOperations(operations) {
    return new Promise(resolve => {
        requestAnimationFrame(() => {
            operations.forEach(op => op());
            resolve();
        });
    });
}

// Initialize all performance optimizations
export function initializePerformanceOptimizations() {
    // Initialize lazy loading
    const imageObserver = initializeLazyLoading();
    
    // Optimize existing images
    optimizeImageLoading();
    
    // Optimize background images for low-end devices
    optimizeBackgroundImages();
    
    // Set up mutation observer for new images
    const mutationObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) { // Element node
                    // Check for new images
                    const newImages = node.querySelectorAll ? 
                        node.querySelectorAll('img.lazy') : [];
                    
                    newImages.forEach(img => imageObserver.observe(img));
                    
                    // Optimize any new regular images
                    const regularImages = node.querySelectorAll ? 
                        node.querySelectorAll('img[src*="communitydragon.org"]') : [];
                    
                    regularImages.forEach(img => {
                        if (!img.src.includes('?w=')) {
                            img.src = getOptimizedImageUrl(img.src);
                        }
                    });
                }
            });
        });
    });
    
    mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    return { imageObserver, mutationObserver };
}
