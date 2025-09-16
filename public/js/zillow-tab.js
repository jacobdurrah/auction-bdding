// Zillow tab functionality with advanced filtering
let zillowData = {};
let auctionProperties = [];
let zillowFilteredProperties = [];
let bidHistoryData = {};

// Filter state
let filters = {
    status: 'all',
    closingTime: 'all',
    zipCode: 'all',
    minBid: null,
    maxBid: null,
    minZestimate: null,
    maxZestimate: null
};

let sortBy = 'savings-desc';
let filterDebounceTimer = null;

// Tab switching
document.addEventListener('DOMContentLoaded', () => {
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchTab(tabName);
        });
    });

    // Fetch Zillow button
    const fetchZillowBtn = document.getElementById('fetchZillowBtn');
    if (fetchZillowBtn) {
        fetchZillowBtn.addEventListener('click', fetchAllZillowData);
    }

    // Refresh Auction button
    const refreshAuctionBtn = document.getElementById('refreshAuctionBtn');
    if (refreshAuctionBtn) {
        refreshAuctionBtn.addEventListener('click', refreshAllAuctionData);
    }

    // Initialize filter controls
    initializeFilters();

    // Load Zillow data on tab switch
    loadZillowData();
});

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab content
    document.getElementById('auctionTab').classList.toggle('active', tabName === 'auction');
    document.getElementById('detailsTab').classList.toggle('active', tabName === 'details');

    // Load data when switching to details tab
    if (tabName === 'details') {
        loadZillowData();
    }
}

function initializeFilters() {
    // Status filter
    document.getElementById('statusFilter')?.addEventListener('change', (e) => {
        filters.status = e.target.value;
        applyFiltersAndSort();
    });

    // Closing time filter
    document.getElementById('closingTimeFilter')?.addEventListener('change', (e) => {
        filters.closingTime = e.target.value;
        applyFiltersAndSort();
    });

    // Zip code filter
    document.getElementById('zipFilter')?.addEventListener('change', (e) => {
        filters.zipCode = e.target.value;
        applyFiltersAndSort();
    });

    // Sort by
    document.getElementById('sortBy')?.addEventListener('change', (e) => {
        sortBy = e.target.value;
        applyFiltersAndSort();
    });

    // Price filters with debounce
    ['minBidFilter', 'maxBidFilter', 'minZestimateFilter', 'maxZestimateFilter'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', (e) => {
            clearTimeout(filterDebounceTimer);
            filterDebounceTimer = setTimeout(() => {
                const filterKey = id.replace('Filter', '');
                filters[filterKey] = e.target.value ? parseFloat(e.target.value) : null;
                applyFiltersAndSort();
            }, 300);
        });
    });

    // Clear filters button
    document.getElementById('clearFilters')?.addEventListener('click', clearAllFilters);
}

async function loadZillowData() {
    try {
        // Load auction properties
        const propResponse = await fetch('/api/properties');
        const propData = await propResponse.json();
        if (propData.success) {
            auctionProperties = propData.properties;

            // Populate dropdowns
            populateClosingTimes();
            populateZipCodes();
        }

        // Load Zillow data
        const zillowResponse = await fetch('/api/zillow-data');
        const zillowResult = await zillowResponse.json();
        if (zillowResult.success) {
            zillowData = zillowResult.data || {};
            // Make zillow data globally available for map view
            window.zillowData = zillowData;
            applyFiltersAndSort();
            updateZillowStatus(`Loaded ${Object.keys(zillowData).length} Zillow records`);
        }

        // Load bid history data
        const bidHistoryResponse = await fetch('/api/bid-history');
        const bidHistoryResult = await bidHistoryResponse.json();
        if (bidHistoryResult.success) {
            bidHistoryData = bidHistoryResult.data || {};
        }
    } catch (error) {
        console.error('Error loading Zillow data:', error);
        updateZillowStatus('Error loading data');
    }
}

function populateClosingTimes() {
    const select = document.getElementById('closingTimeFilter');
    if (!select) return;

    // Get unique closing times
    const closingTimes = [...new Set(auctionProperties
        .map(p => p.biddingCloses)
        .filter(Boolean))]
        .sort();

    // Clear existing options except "All Times"
    select.innerHTML = '<option value="all">All Times</option>';

    // Add each closing time
    closingTimes.forEach(time => {
        const option = document.createElement('option');
        option.value = time;
        option.textContent = time;
        select.appendChild(option);
    });
}

function populateZipCodes() {
    const select = document.getElementById('zipFilter');
    if (!select) return;

    // Get unique zip codes
    const zipCodes = [...new Set(auctionProperties
        .map(p => p.zip)
        .filter(Boolean))]
        .sort();

    // Clear existing options except "All Zip Codes"
    select.innerHTML = '<option value="all">All Zip Codes</option>';

    // Add each zip code
    zipCodes.forEach(zip => {
        const option = document.createElement('option');
        option.value = zip;
        option.textContent = zip;
        select.appendChild(option);
    });
}

function applyFiltersAndSort() {
    // Start with all properties
    zillowFilteredProperties = [...auctionProperties];

    // Apply status filter
    if (filters.status !== 'all') {
        zillowFilteredProperties = zillowFilteredProperties.filter(prop => {
            const hasNoBids = !prop.hasBids || prop.currentBid === 'NONE' || !prop.currentBid;
            if (filters.status === 'nobids') return hasNoBids;
            if (filters.status === 'hasbids') return !hasNoBids;
            return true;
        });
    }

    // Apply closing time filter
    if (filters.closingTime !== 'all') {
        zillowFilteredProperties = zillowFilteredProperties.filter(prop =>
            prop.biddingCloses === filters.closingTime
        );
    }

    // Apply zip code filter
    if (filters.zipCode !== 'all') {
        zillowFilteredProperties = zillowFilteredProperties.filter(prop =>
            prop.zip === filters.zipCode
        );
    }

    // Apply min bid filter
    if (filters.minBid !== null) {
        zillowFilteredProperties = zillowFilteredProperties.filter(prop =>
            (prop.minimumBidNumeric || 0) >= filters.minBid
        );
    }

    // Apply max bid filter
    if (filters.maxBid !== null) {
        zillowFilteredProperties = zillowFilteredProperties.filter(prop =>
            (prop.minimumBidNumeric || 0) <= filters.maxBid
        );
    }

    // Apply Zestimate filters
    if (filters.minZestimate !== null || filters.maxZestimate !== null) {
        zillowFilteredProperties = zillowFilteredProperties.filter(prop => {
            const addressKey = createAddressKey(prop.address, prop.city || 'DETROIT', 'MI', prop.zip || '');
            const zillow = zillowData[addressKey];
            const zestimate = zillow?.zestimate || zillow?.price || 0;

            if (filters.minZestimate !== null && zestimate < filters.minZestimate) return false;
            if (filters.maxZestimate !== null && zestimate > filters.maxZestimate) return false;
            return true;
        });
    }

    // Apply sorting
    sortProperties();

    // Update UI
    updateFilterBadges();
    renderPropertyCards();

    // Update map with filtered properties if map view is available
    if (window.mapView) {
        window.mapView.updateMapProperties(zillowFilteredProperties);
    }
}

function sortProperties() {
    zillowFilteredProperties.sort((a, b) => {
        const addressKeyA = createAddressKey(a.address, a.city || 'DETROIT', 'MI', a.zip || '');
        const addressKeyB = createAddressKey(b.address, b.city || 'DETROIT', 'MI', b.zip || '');
        const zillowA = zillowData[addressKeyA];
        const zillowB = zillowData[addressKeyB];

        switch (sortBy) {
            case 'savings-desc':
            case 'savings-asc': {
                const savingsA = (zillowA?.zestimate || zillowA?.price || 0) - (a.minimumBidNumeric || 0);
                const savingsB = (zillowB?.zestimate || zillowB?.price || 0) - (b.minimumBidNumeric || 0);
                return sortBy === 'savings-desc' ? savingsB - savingsA : savingsA - savingsB;
            }
            case 'minbid-asc':
                return (a.minimumBidNumeric || 0) - (b.minimumBidNumeric || 0);
            case 'minbid-desc':
                return (b.minimumBidNumeric || 0) - (a.minimumBidNumeric || 0);
            case 'zestimate-desc':
            case 'zestimate-asc': {
                const zestA = zillowA?.zestimate || zillowA?.price || 0;
                const zestB = zillowB?.zestimate || zillowB?.price || 0;
                return sortBy === 'zestimate-desc' ? zestB - zestA : zestA - zestB;
            }
            case 'closing-asc':
            case 'closing-desc': {
                const dateA = a.biddingCloses ? new Date(a.biddingCloses) : new Date(9999, 11, 31);
                const dateB = b.biddingCloses ? new Date(b.biddingCloses) : new Date(9999, 11, 31);
                return sortBy === 'closing-asc' ? dateA - dateB : dateB - dateA;
            }
            default:
                return 0;
        }
    });
}

function updateFilterBadges() {
    const activeFiltersEl = document.getElementById('activeFilters');
    const filterCountEl = document.getElementById('filterCount');
    const resultsCountEl = document.getElementById('resultsCount');

    const activeTags = [];
    let filterCount = 0;

    // Check each filter
    if (filters.status !== 'all') {
        activeTags.push({
            label: filters.status === 'nobids' ? 'No Bids' : 'Has Bids',
            key: 'status'
        });
        filterCount++;
    }

    if (filters.closingTime !== 'all') {
        activeTags.push({
            label: `Closing: ${filters.closingTime}`,
            key: 'closingTime'
        });
        filterCount++;
    }

    if (filters.zipCode !== 'all') {
        activeTags.push({
            label: `Zip: ${filters.zipCode}`,
            key: 'zipCode'
        });
        filterCount++;
    }

    if (filters.minBid !== null) {
        activeTags.push({
            label: `Min Bid: $${filters.minBid.toLocaleString()}`,
            key: 'minBid'
        });
        filterCount++;
    }

    if (filters.maxBid !== null) {
        activeTags.push({
            label: `Max Bid: $${filters.maxBid.toLocaleString()}`,
            key: 'maxBid'
        });
        filterCount++;
    }

    if (filters.minZestimate !== null) {
        activeTags.push({
            label: `Min Zest: $${filters.minZestimate.toLocaleString()}`,
            key: 'minZestimate'
        });
        filterCount++;
    }

    if (filters.maxZestimate !== null) {
        activeTags.push({
            label: `Max Zest: $${filters.maxZestimate.toLocaleString()}`,
            key: 'maxZestimate'
        });
        filterCount++;
    }

    // Update active filters display
    if (activeFiltersEl) {
        activeFiltersEl.innerHTML = activeTags.map(tag => `
            <div class="filter-tag">
                ${tag.label}
                <button onclick="removeFilter('${tag.key}')">×</button>
            </div>
        `).join('');
    }

    // Update filter count badge
    if (filterCountEl) {
        if (filterCount > 0) {
            filterCountEl.textContent = `(${filterCount})`;
            filterCountEl.classList.add('active');
        } else {
            filterCountEl.classList.remove('active');
        }
    }

    // Update results count
    if (resultsCountEl) {
        resultsCountEl.textContent = `Showing ${zillowFilteredProperties.length} of ${auctionProperties.length} properties`;
    }
}

function removeFilter(key) {
    if (key === 'status') filters.status = 'all';
    else if (key === 'closingTime') filters.closingTime = 'all';
    else if (key === 'zipCode') filters.zipCode = 'all';
    else if (key === 'minBid') filters.minBid = null;
    else if (key === 'maxBid') filters.maxBid = null;
    else if (key === 'minZestimate') filters.minZestimate = null;
    else if (key === 'maxZestimate') filters.maxZestimate = null;

    // Update UI
    if (key === 'status') document.getElementById('statusFilter').value = 'all';
    else if (key === 'closingTime') document.getElementById('closingTimeFilter').value = 'all';
    else if (key === 'zipCode') document.getElementById('zipFilter').value = 'all';
    else if (key === 'minBid') document.getElementById('minBidFilter').value = '';
    else if (key === 'maxBid') document.getElementById('maxBidFilter').value = '';
    else if (key === 'minZestimate') document.getElementById('minZestimateFilter').value = '';
    else if (key === 'maxZestimate') document.getElementById('maxZestimateFilter').value = '';

    applyFiltersAndSort();
}

function clearAllFilters() {
    filters = {
        status: 'all',
        closingTime: 'all',
        zipCode: 'all',
        minBid: null,
        maxBid: null,
        minZestimate: null,
        maxZestimate: null
    };

    // Reset all inputs
    document.getElementById('statusFilter').value = 'all';
    document.getElementById('closingTimeFilter').value = 'all';
    document.getElementById('zipFilter').value = 'all';
    document.getElementById('minBidFilter').value = '';
    document.getElementById('maxBidFilter').value = '';
    document.getElementById('minZestimateFilter').value = '';
    document.getElementById('maxZestimateFilter').value = '';

    applyFiltersAndSort();
}

function renderPropertyCards() {
    const container = document.getElementById('propertyCards');

    if (zillowFilteredProperties.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 2rem; color: #666;">No properties match your filters. Try adjusting your criteria.</p>';
        return;
    }

    // Combine auction and Zillow data
    const combinedData = zillowFilteredProperties.map(prop => {
        // Create address key for matching
        const addressKey = createAddressKey(prop.address, prop.city || 'DETROIT', 'MI', prop.zip || '');
        const zillow = zillowData[addressKey];

        return {
            ...prop,
            zillow: zillow && !zillow.notFound ? zillow : null
        };
    }).filter(prop => prop.address); // Only show properties with addresses

    // Render cards
    container.innerHTML = combinedData.map(prop => createPropertyCard(prop)).join('');
}

function createPropertyCard(property) {
    const zillow = property.zillow;
    const hasZillow = zillow && !zillow.notFound;

    // Calculate potential savings
    const minBid = property.minimumBidNumeric || 0;
    const zestimate = zillow?.zestimate || zillow?.price || 0;
    const savings = zestimate - minBid;
    const savingsPercent = zestimate > 0 ? Math.round((savings / zestimate) * 100) : 0;

    // Get bid history for this property
    const bidHistory = bidHistoryData[property.auctionId];
    const bidChanges = bidHistory?.metrics?.totalChanges || 0;
    const competitionScore = bidHistory?.metrics?.competitionScore || 0;
    let competitionLevel = 'LOW';
    let competitionClass = 'competition-low';
    if (competitionScore >= 70) {
        competitionLevel = 'HIGH';
        competitionClass = 'competition-high';
    } else if (competitionScore >= 40) {
        competitionLevel = 'MEDIUM';
        competitionClass = 'competition-medium';
    }

    // Format closing time - remove timezone suffix before parsing
    let closingTime = '';
    if (property.biddingCloses) {
        const cleanedDate = property.biddingCloses
            .replace(' ET', '')
            .replace(' EST', '')
            .replace(' EDT', '');
        const parsedDate = new Date(cleanedDate);

        if (!isNaN(parsedDate.getTime())) {
            closingTime = parsedDate.toLocaleString('en-US', {
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        }
    }

    // Get school rating
    const schoolRating = zillow?.schools && zillow.schools.length > 0
        ? Math.round(zillow.schools.reduce((sum, s) => sum + (s.rating || 0), 0) / zillow.schools.length)
        : null;

    // Get last sold date
    const lastSold = zillow?.lastSoldDate || zillow?.lastSold || null;

    return `
        <div class="property-card" data-auction-id="${property.auctionId}">
            ${hasZillow && zillow.imgSrc ?
                `<img src="${zillow.imgSrc}" alt="${property.address}" class="property-image" onerror="this.onerror=null; this.className='property-image no-image'; this.innerHTML='🏠';">` :
                `<div class="property-image no-image">🏠</div>`
            }

            <div class="property-body">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <div>
                        <div class="property-address">${property.address || 'No Address'}</div>
                        <div class="property-city">${property.city || 'DETROIT'}, MI ${property.zip || ''}</div>
                    </div>
                    <button class="refresh-btn" onclick="refreshProperty('${property.auctionId}')" title="Refresh this property">
                        🔄
                    </button>
                </div>

                ${closingTime ? `<div class="closing-time-badge">⏰ Closes: ${closingTime}</div>` : ''}

                <div class="property-metrics">
                    <div class="metric">
                        <span class="metric-label">Auction ID</span>
                        <span class="metric-value">${property.auctionId}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Status</span>
                        <span class="metric-value">${property.hasBids && property.currentBid !== 'NONE' ? 'Has Bids' : 'No Bids'}</span>
                    </div>
                    ${hasZillow ? `
                        <div class="metric">
                            <span class="metric-label">Bedrooms</span>
                            <span class="metric-value">${zillow.bedrooms || 'N/A'}</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Bathrooms</span>
                            <span class="metric-value">${zillow.bathrooms || 'N/A'}</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Sq Ft</span>
                            <span class="metric-value">${zillow.livingAreaValue ? zillow.livingAreaValue.toLocaleString() : 'N/A'}</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Year Built</span>
                            <span class="metric-value">${zillow.yearBuilt || 'N/A'}</span>
                        </div>
                    ` : ''}
                </div>

                <div class="price-comparison">
                    <div class="price-row">
                        <span class="price-label">Min Bid:</span>
                        <span class="price-value">$${minBid.toLocaleString()}</span>
                    </div>
                    ${property.currentBid ? `
                        <div class="price-row">
                            <span class="price-label">Current Bid:</span>
                            <span class="price-value">${property.currentBid}</span>
                        </div>
                    ` : ''}
                    ${hasZillow && zestimate > 0 ? `
                        <div class="price-row">
                            <span class="price-label">Zestimate:</span>
                            <span class="price-value">$${zestimate.toLocaleString()}</span>
                        </div>
                        <div class="price-row">
                            <span class="price-label">Potential Value:</span>
                            <span class="price-value ${savings > 0 ? 'savings-positive' : 'savings-negative'}">
                                ${savings > 0 ? '+' : ''}$${Math.abs(savings).toLocaleString()} (${savingsPercent}%)
                            </span>
                        </div>
                    ` : ''}
                </div>

                <div class="property-metrics-row">
                    <span class="competition-badge ${competitionClass}">
                        ${competitionLevel} Competition
                    </span>
                    ${bidChanges > 0 ? `<span class="metric-badge">📊 ${bidChanges} Bid Changes</span>` : ''}
                    ${schoolRating ? `<span class="metric-badge">🏫 School: ${schoolRating}/10</span>` : ''}
                    ${lastSold ? `<span class="metric-badge">🏷️ Last Sold: ${lastSold}</span>` : ''}
                    ${savingsPercent > 50 ? `<span class="metric-badge">💎 ${savingsPercent}% ROI</span>` : ''}
                </div>

                <div style="margin-top: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <a href="https://www.waynecountytreasurermi.com/AuctionPropertyDetails.aspx?AI_ID=${property.auctionId}"
                       target="_blank" class="btn btn-small">View Auction</a>
                    ${hasZillow && zillow.zpid ?
                        `<a href="https://www.zillow.com/homedetails/${zillow.zpid}_zpid/" target="_blank" class="btn btn-small">View on Zillow</a>` :
                        ''}
                    ${hasZillow && zillow.geocode && zillow.geocode.latitude && zillow.geocode.longitude ?
                        `<a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${zillow.geocode.latitude},${zillow.geocode.longitude}"
                           target="_blank" class="btn btn-small" title="View in Google Street View">🚶 Street View</a>` :
                        ''}
                </div>
            </div>
        </div>
    `;
}

function getRiskBadge(type, risk) {
    if (!risk || !risk.label) return '';

    const label = risk.label.toLowerCase();
    let className = 'risk-minimal';

    if (label.includes('moderate')) className = 'risk-moderate';
    else if (label.includes('major') || label.includes('severe')) className = 'risk-major';

    return `<span class="risk-badge ${className}">${type}: ${risk.value}/10</span>`;
}

function createAddressKey(address, city, state = 'MI', zip = '') {
    if (!address) return '';
    const normalized = `${address}_${city}_${state}_${zip}`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_');
    return normalized;
}

function updateZillowStatus(message) {
    const statusEl = document.getElementById('zillowStatus');
    if (statusEl) {
        statusEl.textContent = message;
    }
}

async function fetchAllZillowData() {
    const fetchBtn = document.getElementById('fetchZillowBtn');
    fetchBtn.disabled = true;
    fetchBtn.textContent = 'Fetching...';
    updateZillowStatus('Starting Zillow data fetch...');

    try {
        const response = await fetch('/api/fetch-zillow', {
            method: 'POST'
        });
        const data = await response.json();

        if (data.success) {
            updateZillowStatus('Zillow fetch started - this will take a while...');
            // Start monitoring progress
            monitorZillowProgress();
        } else {
            updateZillowStatus('Error: ' + data.error);
            fetchBtn.disabled = false;
            fetchBtn.textContent = 'Fetch Zillow Data';
        }
    } catch (error) {
        console.error('Error:', error);
        updateZillowStatus('Error starting fetch');
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Fetch Zillow Data';
    }
}

async function monitorZillowProgress() {
    const interval = setInterval(async () => {
        try {
            const response = await fetch('/api/zillow-status');
            const status = await response.json();

            if (status.isRunning) {
                const percent = Math.round((status.progress / status.total) * 100);
                updateZillowStatus(`Fetching: ${status.progress}/${status.total} (${percent}%)`);
            } else {
                clearInterval(interval);
                updateZillowStatus(`Complete! Fetched ${status.success} properties`);

                const fetchBtn = document.getElementById('fetchZillowBtn');
                fetchBtn.disabled = false;
                fetchBtn.textContent = 'Fetch Zillow Data';

                // Reload the data
                await loadZillowData();
            }
        } catch (error) {
            console.error('Error checking status:', error);
        }
    }, 2000);
}

// Make removeFilter globally accessible
window.removeFilter = removeFilter;

// Refresh individual property
async function refreshProperty(auctionId) {
    const btn = document.querySelector(`[data-auction-id="${auctionId}"] .refresh-btn`);
    if (btn) {
        btn.classList.add('loading');
        btn.disabled = true;
    }

    try {
        const response = await fetch(`/api/refresh-property/${auctionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            // Wait for property to be updated
            setTimeout(async () => {
                await loadAuctionData();
                await loadBidHistory();
                applyFiltersAndSort();
                showToast(`Property ${auctionId} refreshed`);
            }, 2000);
        }
    } catch (error) {
        console.error('Error refreshing property:', error);
        showToast('Failed to refresh property', 'error');
    } finally {
        if (btn) {
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    }
}

// Refresh all auction data
async function refreshAllAuctionData() {
    const btn = document.getElementById('refreshAuctionBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '🔄 Refreshing...';
    }

    try {
        const response = await fetch('/api/fast-scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            showToast('Refreshing all auction data...');

            // Poll for completion
            let checkCount = 0;
            const checkInterval = setInterval(async () => {
                checkCount++;

                const statusResponse = await fetch('/api/status');
                const status = await statusResponse.json();

                if (!status.isRunning || checkCount > 30) {
                    clearInterval(checkInterval);

                    // Reload data
                    await loadAuctionData();
                    await loadBidHistory();
                    applyFiltersAndSort();

                    showToast('All auction data refreshed successfully');

                    if (btn) {
                        btn.textContent = '🔄 Refresh All Auction Data';
                        btn.disabled = false;
                    }
                }
            }, 2000);
        }
    } catch (error) {
        console.error('Error refreshing auction data:', error);
        showToast('Failed to refresh auction data', 'error');

        if (btn) {
            btn.textContent = '🔄 Refresh All Auction Data';
            btn.disabled = false;
        }
    }
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    if (toast && toastMessage) {
        toastMessage.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.remove('hidden');

        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }
}

// Make refresh functions globally accessible
window.refreshProperty = refreshProperty;
window.refreshAllAuctionData = refreshAllAuctionData;