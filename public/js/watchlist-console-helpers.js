// Console helper functions for watchlist management
// These functions are available in the browser console for quick watchlist operations

// Export watchlist and copy to clipboard (use this in your private browser)
function exportWatchlist() {
    const watchlist = localStorage.getItem('auctionWatchlist');
    if (!watchlist) {
        console.log('No watchlist found');
        return;
    }

    const data = JSON.parse(watchlist);
    const jsonString = JSON.stringify(data, null, 2);

    // Try to copy to clipboard
    if (navigator.clipboard) {
        navigator.clipboard.writeText(jsonString).then(() => {
            console.log(`✅ Watchlist copied to clipboard (${data.length} properties)`);
            console.log('Paste this in the other browser using importWatchlist()');
        }).catch(() => {
            console.log('📋 Copy this manually:');
            console.log(jsonString);
        });
    } else {
        console.log('📋 Copy this manually:');
        console.log(jsonString);
    }

    return data;
}

// Import watchlist from clipboard or string (use this in your target browser)
function importWatchlist(data, merge = true) {
    let newData;

    // Handle string or object input
    if (typeof data === 'string') {
        try {
            newData = JSON.parse(data);
        } catch (e) {
            console.error('Invalid JSON format');
            return;
        }
    } else {
        newData = data;
    }

    if (!Array.isArray(newData)) {
        console.error('Watchlist must be an array');
        return;
    }

    if (merge) {
        // Merge with existing watchlist
        const current = localStorage.getItem('auctionWatchlist');
        const currentData = current ? JSON.parse(current) : [];
        const merged = [...new Set([...currentData, ...newData])];

        localStorage.setItem('auctionWatchlist', JSON.stringify(merged));
        console.log(`✅ Merged watchlist: ${newData.length} new + ${currentData.length} existing = ${merged.length} total`);

        // Refresh the page to see changes
        if (confirm('Refresh page to see updated watchlist?')) {
            location.reload();
        }

        return merged;
    } else {
        // Replace existing watchlist
        localStorage.setItem('auctionWatchlist', JSON.stringify(newData));
        console.log(`✅ Replaced watchlist with ${newData.length} properties`);

        // Refresh the page to see changes
        if (confirm('Refresh page to see updated watchlist?')) {
            location.reload();
        }

        return newData;
    }
}

// Merge watchlist from another browser (preserves current list)
function mergeWatchlist(data) {
    return importWatchlist(data, true);
}

// Show current watchlist
function showWatchlist() {
    const watchlist = localStorage.getItem('auctionWatchlist');
    if (!watchlist) {
        console.log('No watchlist found');
        return [];
    }

    const data = JSON.parse(watchlist);
    console.log(`📋 Current watchlist (${data.length} properties):`);
    console.table(data);
    return data;
}

// Clear watchlist (with confirmation)
function clearWatchlist() {
    if (confirm('Are you sure you want to clear the entire watchlist?')) {
        localStorage.removeItem('auctionWatchlist');
        console.log('✅ Watchlist cleared');
        location.reload();
    }
}

// Generate shareable URL
function getShareableLink() {
    const watchlist = localStorage.getItem('auctionWatchlist');
    if (!watchlist) {
        console.log('No watchlist found');
        return;
    }

    const data = JSON.parse(watchlist);
    const baseURL = window.location.origin + window.location.pathname;
    const url = `${baseURL}?watchlist=${data.join(',')}`;

    console.log(`🔗 Shareable link (${data.length} properties):`);
    console.log(url);

    // Try to copy to clipboard
    if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
            console.log('✅ Link copied to clipboard');
        });
    }

    return url;
}

// Instructions for use
console.log('%c🌟 Watchlist Console Helpers Loaded!', 'font-size: 16px; font-weight: bold; color: #4CAF50;');
console.log('%cAvailable commands:', 'font-weight: bold;');
console.log('  exportWatchlist()    - Export watchlist to clipboard');
console.log('  importWatchlist(data) - Import watchlist (merge by default)');
console.log('  mergeWatchlist(data) - Merge with existing watchlist');
console.log('  showWatchlist()      - Show current watchlist');
console.log('  clearWatchlist()     - Clear entire watchlist');
console.log('  getShareableLink()   - Get URL to share watchlist');
console.log('');
console.log('%cQuick sync instructions:', 'font-weight: bold; color: #2196F3;');
console.log('1. In browser with list: Run exportWatchlist()');
console.log('2. In new browser: Run importWatchlist("paste here")');

// Make functions globally available
window.exportWatchlist = exportWatchlist;
window.importWatchlist = importWatchlist;
window.mergeWatchlist = mergeWatchlist;
window.showWatchlist = showWatchlist;
window.clearWatchlist = clearWatchlist;
window.getShareableLink = getShareableLink;