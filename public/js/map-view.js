// Map view functionality for property listings
let map = null;
let markers = [];
let markerCluster = null;
let currentView = 'list'; // 'list' or 'map'
let mapProperties = [];
let selectedMarker = null;

// Initialize map
function initializeMap() {
    // Create map centered on Detroit
    map = L.map('mapContainer').setView([42.3314, -83.0458], 11);

    // Define tile layers
    const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    });

    // ESRI World Imagery satellite layer
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19
    });

    // Hybrid layer (satellite with labels)
    const hybridLayer = L.layerGroup([
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri',
            maxZoom: 19
        }),
        L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/toner-labels/{z}/{x}/{y}{r}.png', {
            attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>',
            subdomains: 'abcd',
            maxZoom: 19,
            opacity: 0.8
        })
    ]);

    // Add default layer (street map)
    streetLayer.addTo(map);

    // Define base layers for the control
    const baseLayers = {
        "🗺️ Street Map": streetLayer,
        "🛰️ Satellite": satelliteLayer,
        "🏷️ Hybrid": hybridLayer
    };

    // Add layer control to the map
    L.control.layers(baseLayers, null, {
        position: 'topright',
        collapsed: true
    }).addTo(map);

    // Initialize marker cluster group for performance
    markerCluster = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 60,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: false,
        iconCreateFunction: function(cluster) {
            const count = cluster.getChildCount();
            let size = 'small';
            let className = 'marker-cluster-small';

            if (count > 100) {
                size = 'large';
                className = 'marker-cluster-large';
            } else if (count > 50) {
                size = 'medium';
                className = 'marker-cluster-medium';
            }

            return new L.DivIcon({
                html: `<div><span>${count}</span></div>`,
                className: `marker-cluster ${className}`,
                iconSize: new L.Point(40, 40)
            });
        }
    });

    map.addLayer(markerCluster);
}

// Create marker for a property
function createPropertyMarker(property) {
    // Get coordinates from geocode data
    const addressKey = getAddressKey(property.address, property.city || 'DETROIT', 'MI', property.zip);
    const zillowData = window.zillowData?.[addressKey];

    if (!zillowData?.geocode?.latitude || !zillowData?.geocode?.longitude) {
        return null;
    }

    const lat = zillowData.geocode.latitude;
    const lng = zillowData.geocode.longitude;

    // Determine marker color based on status
    let markerColor = 'blue';
    if (property.hasBids) {
        markerColor = 'red';
    } else if (property.minimumBidNumeric < 1000) {
        markerColor = 'green';
    }

    // Create custom icon
    const icon = L.divIcon({
        className: 'property-marker',
        html: `<div class="marker-pin ${markerColor}">
                 <span class="price">$${(property.minimumBidNumeric / 1000).toFixed(0)}k</span>
               </div>`,
        iconSize: [30, 42],
        iconAnchor: [15, 42],
        popupAnchor: [0, -42]
    });

    // Create marker
    const marker = L.marker([lat, lng], { icon });

    // Store property data with marker
    marker.propertyData = property;

    // Create popup content
    const popupContent = createPropertyPopup(property, zillowData);
    marker.bindPopup(popupContent, {
        maxWidth: 350,
        className: 'property-popup'
    });

    // Handle marker events
    marker.on('click', function() {
        selectedMarker = this;
        highlightProperty(property.auctionId);
    });

    marker.on('popupopen', function() {
        // Add event listeners to popup buttons
        setTimeout(() => {
            const viewBtn = document.querySelector('.popup-view-btn');
            const refreshBtn = document.querySelector('.popup-refresh-btn');

            if (viewBtn) {
                viewBtn.addEventListener('click', () => {
                    window.open(`https://www.waynecountytreasurermi.com/AuctionPropertyDetails.aspx?AI_ID=${property.auctionId}`, '_blank');
                });
            }

            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => {
                    refreshProperty(property.auctionId);
                });
            }
        }, 100);
    });

    return marker;
}

// Create popup content for property
function createPropertyPopup(property, zillowData) {
    const closingTime = formatClosingTime(property.biddingCloses);
    const zestimate = zillowData?.zestimate ? `$${zillowData.zestimate.toLocaleString()}` : 'N/A';
    const rentEstimate = zillowData?.rentZestimate ? `$${zillowData.rentZestimate.toLocaleString()}/mo` : 'N/A';
    const bidStatus = property.hasBids ?
        `<span class="status-badge has-bids">Has Bids</span>` :
        `<span class="status-badge no-bids">No Bids</span>`;

    return `
        <div class="property-popup-content">
            <h3>${property.address}</h3>
            <p class="city-zip">${property.city || 'DETROIT'}, MI ${property.zip || ''}</p>

            <div class="popup-stats">
                <div class="stat">
                    <span class="label">Min Bid:</span>
                    <span class="value">$${property.minimumBidNumeric.toLocaleString()}</span>
                </div>
                <div class="stat">
                    <span class="label">Current:</span>
                    <span class="value">${property.currentBid || 'None'}</span>
                </div>
                <div class="stat">
                    <span class="label">Zestimate:</span>
                    <span class="value">${zestimate}</span>
                </div>
                <div class="stat">
                    <span class="label">Rent Est:</span>
                    <span class="value">${rentEstimate}</span>
                </div>
            </div>

            <div class="popup-info">
                ${bidStatus}
                <p><strong>Closes:</strong> ${closingTime}</p>
                <p><strong>SEV:</strong> $${(property.sevValueNumeric || 0).toLocaleString()}</p>
            </div>

            <div class="popup-actions">
                <button class="btn btn-small popup-view-btn">View Details</button>
                <button class="btn btn-small popup-refresh-btn">Refresh</button>
                ${zillowData?.geocode?.latitude && zillowData?.geocode?.longitude ?
                    `<button class="btn btn-small popup-streetview-btn"
                             onclick="window.open('https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${zillowData.geocode.latitude},${zillowData.geocode.longitude}', '_blank')"
                             title="View in Google Street View">🚶 Street View</button>` :
                    ''}
            </div>
        </div>
    `;
}

// Load properties onto map
function loadMapProperties(properties) {
    // Clear existing markers
    markerCluster.clearLayers();
    markers = [];

    // Add markers for properties with coordinates
    let addedCount = 0;
    properties.forEach(property => {
        const marker = createPropertyMarker(property);
        if (marker) {
            markers.push(marker);
            addedCount++;
        }
    });

    // Add all markers to cluster
    markerCluster.addLayers(markers);

    console.log(`Added ${addedCount} properties to map out of ${properties.length} total`);

    // Fit map to show all markers
    if (markers.length > 0) {
        const group = new L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

// Toggle between list and map view
function toggleView(view) {
    if (view === currentView) return;

    currentView = view;

    const listContainer = document.getElementById('listContainer');
    const mapContainer = document.getElementById('mapContainer');
    const listBtn = document.getElementById('listViewBtn');
    const mapBtn = document.getElementById('mapViewBtn');

    if (view === 'map') {
        listContainer.style.display = 'none';
        mapContainer.style.display = 'block';
        listBtn.classList.remove('active');
        mapBtn.classList.add('active');

        // Initialize map if not already done
        if (!map) {
            setTimeout(() => {
                initializeMap();
                loadMapProperties(mapProperties);
            }, 100);
        } else {
            // Refresh map size
            setTimeout(() => {
                map.invalidateSize();
            }, 100);
        }
    } else {
        listContainer.style.display = 'block';
        mapContainer.style.display = 'none';
        listBtn.classList.add('active');
        mapBtn.classList.remove('active');
    }
}

// Highlight property on map
function highlightProperty(auctionId) {
    const marker = markers.find(m => m.propertyData.auctionId === auctionId);
    if (marker) {
        // Just open popup without changing zoom
        marker.openPopup();
    }
}

// Filter markers based on current filters
function filterMapMarkers(filters) {
    markerCluster.clearLayers();

    const filteredMarkers = markers.filter(marker => {
        const property = marker.propertyData;

        // Apply the same filters as the list view
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            const addressMatch = (property.address || '').toLowerCase().includes(searchLower);
            const cityMatch = (property.city || '').toLowerCase().includes(searchLower);
            if (!addressMatch && !cityMatch) return false;
        }

        if (filters.bidStatus === 'unbid' && property.hasBids) return false;
        if (filters.bidStatus === 'hasbids' && !property.hasBids) return false;

        const minBid = property.minimumBidNumeric || 0;
        if (minBid < filters.minPrice || minBid > filters.maxPrice) return false;

        if (filters.closingTime && property.biddingCloses !== filters.closingTime) return false;
        if (filters.zipCode && property.zip !== filters.zipCode) return false;

        return true;
    });

    markerCluster.addLayers(filteredMarkers);
}

// Update map when properties change
function updateMapProperties(properties) {
    mapProperties = properties;
    if (map && currentView === 'map') {
        loadMapProperties(properties);
    }
}

// Format closing time for display
function formatClosingTime(closingTime) {
    if (!closingTime || closingTime === 'N/A') return 'N/A';

    const cleaned = closingTime.replace(' ET', '').replace(' EST', '').replace(' EDT', '');
    const date = new Date(cleaned);

    if (isNaN(date.getTime())) return closingTime;

    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

// Get address key for zillow data lookup
function getAddressKey(address, city = 'DETROIT', state = 'MI', zip = '') {
    if (!address) return null;
    return `${address}_${city}_${state}_${zip}`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_');
}

// Export functions for use in other modules
window.mapView = {
    initializeMap,
    toggleView,
    updateMapProperties,
    filterMapMarkers,
    highlightProperty,
    currentView: () => currentView
};