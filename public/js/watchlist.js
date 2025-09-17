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

    // Public API
    return {
        add,
        remove,
        toggle,
        isInWatchlist,
        getAll,
        getCount,
        clear,
        load
    };
})();

// Make available globally
window.Watchlist = Watchlist;