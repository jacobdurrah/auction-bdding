// Watchlist module for managing property watchlist using localStorage
const Watchlist = (function() {
    const STORAGE_KEY = 'auctionWatchlist';

    // Load watchlist from localStorage
    function load() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('Error loading watchlist:', error);
            return [];
        }
    }

    // Save watchlist to localStorage
    function save(watchlist) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist));
            dispatchWatchlistEvent();
        } catch (error) {
            console.error('Error saving watchlist:', error);
        }
    }

    // Add property to watchlist
    function add(auctionId) {
        const watchlist = load();
        if (!watchlist.includes(auctionId)) {
            watchlist.push(auctionId);
            save(watchlist);
            showToast(`Property ${auctionId} added to watchlist`);
            return true;
        }
        return false;
    }

    // Remove property from watchlist
    function remove(auctionId) {
        const watchlist = load();
        const index = watchlist.indexOf(auctionId);
        if (index > -1) {
            watchlist.splice(index, 1);
            save(watchlist);
            showToast(`Property ${auctionId} removed from watchlist`);
            return true;
        }
        return false;
    }

    // Toggle property in watchlist
    function toggle(auctionId) {
        if (isInWatchlist(auctionId)) {
            remove(auctionId);
            return false;
        } else {
            add(auctionId);
            return true;
        }
    }

    // Check if property is in watchlist
    function isInWatchlist(auctionId) {
        const watchlist = load();
        return watchlist.includes(auctionId);
    }

    // Get all watchlist items
    function getAll() {
        return load();
    }

    // Get watchlist count
    function getCount() {
        return load().length;
    }

    // Clear entire watchlist
    function clear() {
        localStorage.removeItem(STORAGE_KEY);
        dispatchWatchlistEvent();
        showToast('Watchlist cleared');
    }

    // Dispatch custom event when watchlist changes
    function dispatchWatchlistEvent() {
        window.dispatchEvent(new CustomEvent('watchlistChanged', {
            detail: { count: getCount() }
        }));
    }

    // Show toast notification
    function showToast(message) {
        // Check if toast element exists, if not create it
        let toast = document.getElementById('watchlist-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'watchlist-toast';
            toast.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: #333;
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                display: none;
                z-index: 10000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                animation: slideUp 0.3s ease;
            `;
            document.body.appendChild(toast);

            // Add animation
            const style = document.createElement('style');
            style.textContent = `
                @keyframes slideUp {
                    from { transform: translateY(100px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

        toast.textContent = message;
        toast.style.display = 'block';

        setTimeout(() => {
            toast.style.display = 'none';
        }, 3000);
    }

    // Export watchlist to JSON string
    function exportToJSON() {
        const watchlist = load();
        return JSON.stringify(watchlist, null, 2);
    }

    // Export watchlist and download as file
    function exportToFile() {
        const watchlist = load();
        const dataStr = JSON.stringify(watchlist, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `watchlist_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showToast(`Watchlist exported (${watchlist.length} properties)`);
    }

    // Import watchlist from JSON string
    function importFromJSON(jsonString, merge = false) {
        try {
            const newItems = JSON.parse(jsonString);
            if (!Array.isArray(newItems)) {
                throw new Error('Invalid watchlist format');
            }

            if (merge) {
                // Merge with existing
                const current = load();
                const merged = [...new Set([...current, ...newItems])];
                save(merged);
                showToast(`Merged ${newItems.length} items (${merged.length} total)`);
                return merged;
            } else {
                // Replace existing
                save(newItems);
                showToast(`Imported ${newItems.length} properties`);
                return newItems;
            }
        } catch (error) {
            console.error('Import error:', error);
            showToast('Error importing watchlist', 'error');
            return null;
        }
    }

    // Import from file input
    function importFromFile(file, merge = false) {
        const reader = new FileReader();
        reader.onload = (e) => {
            importFromJSON(e.target.result, merge);
        };
        reader.readAsText(file);
    }

    // Copy watchlist to clipboard
    function copyToClipboard() {
        const watchlist = load();
        const jsonString = JSON.stringify(watchlist);

        if (navigator.clipboard) {
            navigator.clipboard.writeText(jsonString).then(() => {
                showToast(`Copied ${watchlist.length} properties to clipboard`);
            }).catch(() => {
                // Fallback
                prompt('Copy this watchlist:', jsonString);
            });
        } else {
            prompt('Copy this watchlist:', jsonString);
        }
    }

    // Load from URL parameters
    function loadFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        const watchlistParam = urlParams.get('watchlist');

        if (watchlistParam) {
            try {
                const items = watchlistParam.split(',');
                return items;
            } catch (error) {
                console.error('Error parsing URL watchlist:', error);
            }
        }
        return null;
    }

    // Generate shareable URL
    function getShareableURL() {
        const watchlist = load();
        const baseURL = window.location.origin + window.location.pathname;
        const params = new URLSearchParams();
        params.set('watchlist', watchlist.join(','));
        return `${baseURL}?${params.toString()}`;
    }

    // Public API
    return {
        add,
        remove,
        toggle,
        isInWatchlist,
        getAll,
        getCount,
        clear,
        load,
        exportToJSON,
        exportToFile,
        importFromJSON,
        importFromFile,
        copyToClipboard,
        loadFromURL,
        getShareableURL
    };
})();

// Make available globally
window.Watchlist = Watchlist;