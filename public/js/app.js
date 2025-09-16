// State management
let allProperties = [];
let filteredProperties = [];
let currentPage = 1;
const itemsPerPage = 50;
let sortColumn = 'biddingCloses';
let sortDirection = 'asc';

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

            // Show last updated time if available
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

// Setup auto-refresh (optional)
function setupAutoRefresh() {
    const autoRefreshMinutes = 15; // Change this to adjust refresh interval

    // Uncomment to enable auto-refresh
    // setInterval(() => {
    //     loadProperties();
    // }, autoRefreshMinutes * 60 * 1000);
}