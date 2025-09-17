// State management
let allProperties = [];
let filteredProperties = [];
let currentPage = 1;
const itemsPerPage = 50;
let sortColumn = 'biddingCloses';
let sortDirection = 'asc';

// Auto-refresh state
let autoRefreshInterval = null;
let autoRefreshEnabled = false;
let refreshCountdown = 30; // seconds
let countdownInterval = null;

// DOM Elements
const refreshBtn = document.getElementById('refreshBtn');
const exportBtn = document.getElementById('exportBtn');
const searchInput = document.getElementById('searchInput');
const bidFilter = document.getElementById('bidFilter');
const minPrice = document.getElementById('minPrice');
const maxPrice = document.getElementById('maxPrice');
const filterBtn = document.getElementById('filterBtn');
const tableBody = document.getElementById('tableBody');
const progressBar = document.getElementById('progressBar');
const progressFill = document.querySelector('.progress-fill');
const progressText = document.querySelector('.progress-text');
const totalProperties = document.getElementById('totalProperties');
const unbidProperties = document.getElementById('unbidProperties');
const lastUpdate = document.getElementById('lastUpdate');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check if running on Vercel or localhost
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    // Hide refresh button on Vercel, show info message
    if (!isLocal) {
        refreshBtn.style.display = 'none';
        const info = document.createElement('div');
        info.className = 'info-message';
        info.innerHTML = '📊 This data is updated periodically. For real-time updates, run the scraper locally.';
        refreshBtn.parentElement.appendChild(info);
    }

    loadProperties();
    setupEventListeners();
    setupAutoRefresh();
});

// Event Listeners
function setupEventListeners() {
    refreshBtn.addEventListener('click', refreshAllData);
    exportBtn.addEventListener('click', exportToCSV);
    searchInput.addEventListener('input', applyFilters);
    bidFilter.addEventListener('change', applyFilters);
    filterBtn.addEventListener('click', applyFilters);

    // Sorting
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            if (sortColumn === column) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = column;
                sortDirection = 'asc';
            }
            sortProperties();
            renderTable();
        });
    });

    // Pagination
    document.getElementById('prevPage')?.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    });

    document.getElementById('nextPage')?.addEventListener('click', () => {
        const maxPage = Math.ceil(filteredProperties.length / itemsPerPage);
        if (currentPage < maxPage) {
            currentPage++;
            renderTable();
        }
    });
}

// Load properties from server
async function loadProperties() {
    try {
        const response = await fetch('/api/properties');
        const data = await response.json();

        if (data.success) {
            allProperties = data.properties;
            applyFilters();
            updateStats();

            // Display last refresh time from file modification date
            if (data.lastModified) {
                const lastModified = new Date(data.lastModified);
                const now = new Date();
                const diffMs = now - lastModified;
                const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

                let timeAgo = '';
                if (diffHours > 0) {
                    timeAgo = `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
                } else if (diffMinutes > 0) {
                    timeAgo = `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
                } else {
                    timeAgo = 'just now';
                }

                const formattedDate = lastModified.toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });

                // Update the refresh bar if it exists
                const refreshTimeEl = document.getElementById('lastRefreshTime');
                const refreshBarEl = document.getElementById('lastRefreshBar');
                if (refreshTimeEl && refreshBarEl) {
                    refreshTimeEl.textContent = `${formattedDate} (${timeAgo})`;
                    refreshBarEl.style.display = 'flex';
                }
            }

            // Show last updated time if available (fallback)
            if (data.lastUpdated) {
                lastUpdate.textContent = `Updated: ${new Date(data.lastUpdated).toLocaleString()}`;
            }

            if (data.isStatic && data.count === 0) {
                showToast('No data available. Data needs to be scraped locally first.', 'warning');
            } else {
                showToast(`Loaded ${data.count} properties`);
            }
        }
    } catch (error) {
        console.error('Error loading properties:', error);
        showToast('Error loading properties', 'error');
    }
}

// Refresh all auction data
async function refreshAllData() {
    if (refreshBtn.disabled) return;

    refreshBtn.disabled = true;
    refreshBtn.classList.add('loading');
    progressBar.classList.remove('hidden');

    try {
        // Determine which endpoint to use based on port
        const isFastServer = window.location.port === '3001';
        const endpoint = isFastServer ? '/api/fast-scrape' : '/api/scrape';

        // Start scraping
        const response = await fetch(endpoint, { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            showToast('Scraping started...');
            monitorProgress();
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error starting scrape:', error);
        showToast('Error starting scrape', 'error');
        refreshBtn.disabled = false;
        refreshBtn.classList.remove('loading');
        progressBar.classList.add('hidden');
    }
}

// Monitor scraping progress
async function monitorProgress() {
    const interval = setInterval(async () => {
        try {
            const response = await fetch('/api/status');
            const status = await response.json();

            if (status.isRunning) {
                const percent = Math.round((status.progress / status.total) * 100);
                progressFill.style.width = `${percent}%`;
                progressText.textContent = `Scraping ${status.currentId || '...'} (${status.progress}/${status.total})`;
            } else {
                clearInterval(interval);
                progressBar.classList.add('hidden');
                refreshBtn.disabled = false;
                refreshBtn.classList.remove('loading');

                if (status.errors.length > 0) {
                    showToast(`Completed with ${status.errors.length} errors`, 'warning');
                } else {
                    showToast('Scraping completed successfully!', 'success');
                }

                // Reload properties
                await loadProperties();
            }
        } catch (error) {
            console.error('Error checking status:', error);
        }
    }, 2000);
}

// Apply filters
function applyFilters() {
    const search = searchInput.value.toLowerCase();
    const bidStatus = bidFilter.value;
    const min = parseFloat(minPrice.value) || 0;
    const max = parseFloat(maxPrice.value) || Infinity;

    filteredProperties = allProperties.filter(prop => {
        // Search filter
        if (search) {
            const addressMatch = (prop.address || '').toLowerCase().includes(search);
            const parcelMatch = (prop.parcelId || '').toLowerCase().includes(search);
            const cityMatch = (prop.city || '').toLowerCase().includes(search);
            if (!addressMatch && !parcelMatch && !cityMatch) return false;
        }

        // Bid status filter
        if (bidStatus === 'unbid' && prop.hasBids) return false;
        if (bidStatus === 'hasbids' && !prop.hasBids) return false;

        // Price filter
        const minBid = prop.minimumBidNumeric || 0;
        if (minBid < min || minBid > max) return false;

        return true;
    });

    currentPage = 1;
    sortProperties();
    renderTable();
    updateStats();
}

// Sort properties
function sortProperties() {
    filteredProperties.sort((a, b) => {
        let aVal = a[sortColumn];
        let bVal = b[sortColumn];

        // Handle null/undefined
        if (aVal == null) aVal = '';
        if (bVal == null) bVal = '';

        // Parse dates for closing time
        if (sortColumn === 'biddingCloses') {
            // Remove timezone suffix for parsing
            const parseDate = (dateStr) => {
                if (!dateStr) return 0;
                const cleaned = dateStr.replace(' ET', '').replace(' EST', '').replace(' EDT', '');
                const date = new Date(cleaned);
                return !isNaN(date.getTime()) ? date.getTime() : 0;
            };
            aVal = parseDate(aVal);
            bVal = parseDate(bVal);
        }

        // Compare
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
}

// Render table
function renderTable() {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageProperties = filteredProperties.slice(start, end);

    if (pageProperties.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="9" class="loading">No properties found</td></tr>';
        return;
    }

    tableBody.innerHTML = pageProperties.map(prop => {
        // Parse closing time, removing 'ET' suffix for JavaScript Date parsing
        let closingTime = 'N/A';
        if (prop.biddingCloses) {
            const dateStr = prop.biddingCloses.replace(' ET', '').replace(' EST', '').replace(' EDT', '');
            const date = new Date(dateStr);
            closingTime = !isNaN(date.getTime()) ? date.toLocaleString() : prop.biddingCloses;
        }
        const statusClass = prop.hasBids ? 'has-bids' : 'no-bids';
        const statusText = prop.hasBids ? 'Has Bids' : 'No Bids';

        return `
            <tr class="${statusClass}">
                <td>${prop.auctionId || 'N/A'}</td>
                <td>${prop.address || 'N/A'}</td>
                <td>${prop.city || 'N/A'}</td>
                <td>$${(prop.minimumBidNumeric || 0).toLocaleString()}</td>
                <td>${prop.currentBid || 'None'}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${closingTime}</td>
                <td>$${(prop.sevValueNumeric || 0).toLocaleString()}</td>
                <td>
                    <a href="https://www.waynecountytreasurermi.com/AuctionPropertyDetails.aspx?AI_ID=${prop.auctionId}"
                       target="_blank" class="btn btn-small">View</a>
                </td>
            </tr>
        `;
    }).join('');

    // Update pagination
    const maxPage = Math.ceil(filteredProperties.length / itemsPerPage);
    document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${maxPage}`;
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage === maxPage;
    document.getElementById('pagination').classList.toggle('hidden', filteredProperties.length <= itemsPerPage);
}

// Update statistics
function updateStats() {
    const unbid = allProperties.filter(p => !p.hasBids).length;
    totalProperties.textContent = `${allProperties.length} properties`;
    unbidProperties.textContent = `${unbid} unbid`;

    if (allProperties.length > 0) {
        const latest = allProperties[0].scrapedAt;
        if (latest) {
            lastUpdate.textContent = `Updated: ${new Date(latest).toLocaleString()}`;
        }
    }
}

// Export to CSV
function exportToCSV() {
    if (filteredProperties.length === 0) {
        showToast('No data to export', 'warning');
        return;
    }

    const headers = ['Auction ID', 'Address', 'City', 'ZIP', 'Min Bid', 'Current Bid', 'Has Bids', 'Closing Time', 'SEV Value'];
    const rows = filteredProperties.map(prop => [
        prop.auctionId || '',
        prop.address || '',
        prop.city || '',
        prop.zip || '',
        prop.minimumBid || '',
        prop.currentBid || '',
        prop.hasBids ? 'Yes' : 'No',
        prop.biddingCloses || '',
        prop.sevValue || ''
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => {
        const value = String(cell).replace(/"/g, '""');
        return value.includes(',') ? `"${value}"` : value;
    }).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auction-properties-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('CSV exported successfully', 'success');
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    toastMessage.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// Save current UI state to sessionStorage
function saveUIState() {
    const state = {
        scrollPosition: window.pageYOffset,
        searchTerm: searchInput.value,
        bidFilter: bidFilter.value,
        minPrice: minPrice.value,
        maxPrice: maxPrice.value,
        sortColumn: sortColumn,
        sortDirection: sortDirection,
        currentPage: currentPage,
        watchlistFilter: document.querySelector('.watchlist-chip')?.classList.contains('active') || false
    };
    sessionStorage.setItem('propertyDetailsState', JSON.stringify(state));
}

// Restore UI state from sessionStorage
function restoreUIState() {
    const savedState = sessionStorage.getItem('propertyDetailsState');
    if (!savedState) return;

    const state = JSON.parse(savedState);

    // Restore form values
    searchInput.value = state.searchTerm || '';
    bidFilter.value = state.bidFilter || 'all';
    minPrice.value = state.minPrice || '';
    maxPrice.value = state.maxPrice || '';

    // Restore sort settings
    sortColumn = state.sortColumn || 'biddingCloses';
    sortDirection = state.sortDirection || 'asc';
    currentPage = state.currentPage || 1;

    // Restore watchlist filter
    const watchlistChip = document.querySelector('.watchlist-chip');
    if (watchlistChip && state.watchlistFilter) {
        watchlistChip.classList.add('active');
    }

    // Restore scroll position after a brief delay
    setTimeout(() => {
        window.scrollTo(0, state.scrollPosition || 0);
    }, 100);
}

// Smart properties refresh that preserves state
async function smartRefreshProperties() {
    // Save current state before refresh
    saveUIState();

    try {
        const response = await fetch('/api/properties');
        const data = await response.json();

        if (data.success) {
            // Store old properties for comparison
            const oldPropertiesMap = new Map(allProperties.map(p => [p.auctionId, p]));

            // Update properties
            allProperties = data.properties;

            // Check for bid changes
            let changedProperties = [];
            allProperties.forEach(prop => {
                const oldProp = oldPropertiesMap.get(prop.auctionId);
                if (oldProp && oldProp.currentBid !== prop.currentBid) {
                    changedProperties.push(prop.auctionId);
                }
            });

            // Apply filters without resetting state
            applyFilters();
            updateStats();

            // Restore UI state
            restoreUIState();

            // Show notification if there were changes
            if (changedProperties.length > 0) {
                showToast(`✅ Updated! ${changedProperties.length} properties have new bids`, 'success');
            }

            // Update last refresh timestamp
            if (data.lastUpdated) {
                lastUpdate.textContent = `Updated: ${new Date(data.lastUpdated).toLocaleString()}`;
            }
        }
    } catch (error) {
        console.error('Error refreshing properties:', error);
    }
}

// Toggle auto-refresh
function toggleAutoRefresh() {
    autoRefreshEnabled = !autoRefreshEnabled;

    // Update both toggle buttons if they exist
    const toggleBtn1 = document.getElementById('autoRefreshToggle');
    const toggleBtn2 = document.getElementById('autoRefreshToggle2');
    const countdownDisplay1 = document.getElementById('refreshCountdown');
    const countdownDisplay2 = document.getElementById('refreshCountdown2');

    if (autoRefreshEnabled) {
        // Start auto-refresh
        if (toggleBtn1) {
            toggleBtn1.classList.add('active');
            toggleBtn1.innerHTML = '🔄 Auto-Refresh: ON';
        }
        if (toggleBtn2) {
            toggleBtn2.classList.add('active');
            toggleBtn2.innerHTML = '🔄 Auto-Refresh: ON';
        }
        localStorage.setItem('autoRefreshEnabled', 'true');

        // Reset countdown
        refreshCountdown = 30;

        // Start countdown interval
        countdownInterval = setInterval(() => {
            refreshCountdown--;
            if (countdownDisplay1) {
                countdownDisplay1.textContent = `(${refreshCountdown}s)`;
            }
            if (countdownDisplay2) {
                countdownDisplay2.textContent = `(${refreshCountdown}s)`;
            }

            if (refreshCountdown <= 0) {
                smartRefreshProperties();
                refreshCountdown = 30;
            }
        }, 1000);

        // Start refresh interval (backup)
        autoRefreshInterval = setInterval(() => {
            smartRefreshProperties();
            refreshCountdown = 30;
        }, 30000);

    } else {
        // Stop auto-refresh
        if (toggleBtn1) {
            toggleBtn1.classList.remove('active');
            toggleBtn1.innerHTML = '🔄 Auto-Refresh: OFF';
        }
        if (toggleBtn2) {
            toggleBtn2.classList.remove('active');
            toggleBtn2.innerHTML = '🔄 Auto-Refresh: OFF';
        }
        localStorage.setItem('autoRefreshEnabled', 'false');

        // Clear intervals
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
            autoRefreshInterval = null;
        }

        if (countdownDisplay1) {
            countdownDisplay1.textContent = '';
        }
        if (countdownDisplay2) {
            countdownDisplay2.textContent = '';
        }
    }
}

// Setup auto-refresh
function setupAutoRefresh() {
    // Check if auto-refresh was previously enabled
    const wasEnabled = localStorage.getItem('autoRefreshEnabled') === 'true';

    // Only auto-enable on Property Details tab
    const isPropertyDetailsTab = document.getElementById('auctionTab')?.classList.contains('active');

    if (wasEnabled && isPropertyDetailsTab) {
        // Wait a moment for DOM to be ready
        setTimeout(() => {
            const toggleBtn = document.getElementById('autoRefreshToggle');
            if (toggleBtn) {
                toggleAutoRefresh();
            }
        }, 500);
    }
}