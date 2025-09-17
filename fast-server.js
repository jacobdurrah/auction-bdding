const express = require('express');
const cors = require('cors');
const compression = require('compression');
const fs = require('fs').promises;
const path = require('path');
const ParallelAuctionScraper = require('./parallel-scraper');
const ZillowFetcher = require('./zillow-fetcher');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.static('public'));

// Data storage
const DATA_DIR = path.join(__dirname, 'data');
const PROPERTIES_FILE = path.join(DATA_DIR, 'properties.json');

// Scraping status with worker details
let scrapingStatus = {
    isRunning: false,
    progress: 0,
    total: 0,
    workersProgress: {},
    startTime: null,
    estimatedTimeRemaining: null,
    propertiesPerSecond: 0,
    errors: []
};

// Ensure data directory exists
async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating data directory:', error);
    }
}

// Load properties from file
async function loadProperties() {
    try {
        const data = await fs.readFile(PROPERTIES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

// Save properties to file
async function saveProperties(properties) {
    await ensureDataDir();
    await fs.writeFile(PROPERTIES_FILE, JSON.stringify(properties, null, 2));
}

// Load Zillow data from file
async function loadZillowData() {
    try {
        const zillowFile = path.join(DATA_DIR, 'zillow-data.json');
        const data = await fs.readFile(zillowFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get all properties
app.get('/api/properties', async (req, res) => {
    try {
        const properties = await loadProperties();

        // Get last modified time of properties.json
        let lastModified = null;
        try {
            const stats = await fs.stat(path.join(DATA_DIR, 'properties.json'));
            lastModified = stats.mtime;
        } catch (error) {
            console.log('Could not get file stats');
        }

        res.json({
            success: true,
            count: properties.length,
            properties: properties,
            lastModified: lastModified
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get scraping status with worker details
app.get('/api/status', (req, res) => {
    res.json(scrapingStatus);
});

// Fast parallel scraping
app.post('/api/fast-scrape', async (req, res) => {
    if (scrapingStatus.isRunning) {
        return res.status(400).json({
            success: false,
            error: 'Scraping already in progress'
        });
    }

    const {
        startId = parseInt(process.env.SCRAPE_START_ID) || 250900000,
        endId = parseInt(process.env.SCRAPE_END_ID) || 250902570,
        workerCount = parseInt(process.env.WORKERS) || 10
    } = req.body || {};

    // Send immediate response
    res.json({
        success: true,
        message: `Fast parallel scraping started with ${workerCount} workers`,
        range: { startId, endId },
        estimatedTime: Math.ceil((endId - startId + 1) / (workerCount * 50)) + ' seconds'
    });

    // Start fast scraping in background
    fastScrapeProperties(startId, endId, workerCount);
});

// Background fast scraping function
async function fastScrapeProperties(startId, endId, workerCount) {
    const scraper = new ParallelAuctionScraper({
        username: process.env.AUCTION_USER || 'jacob.e.durrah@gmail.com',
        password: process.env.AUCTION_PASSWORD || 'Bogieman@12j',
        workerCount: workerCount,
        headless: true
    });

    // Update status
    scrapingStatus = {
        isRunning: true,
        progress: 0,
        total: endId - startId + 1,
        workersProgress: {},
        startTime: new Date(),
        estimatedTimeRemaining: null,
        propertiesPerSecond: 0,
        errors: []
    };

    try {
        console.log(`\n🚀 Starting FAST parallel scraping`);
        console.log(`   Range: ${startId} to ${endId}`);
        console.log(`   Workers: ${workerCount}`);
        console.log(`   Estimated time: ${Math.ceil(scrapingStatus.total / (workerCount * 50))} seconds\n`);

        await scraper.initialize();

        const results = await scraper.scrapeRange(startId, endId, (progress) => {
            // Update scraping status
            scrapingStatus.progress = progress.completed;
            scrapingStatus.workersProgress = progress.workersProgress;

            // Calculate speed and ETA
            const elapsed = (Date.now() - scrapingStatus.startTime) / 1000;
            scrapingStatus.propertiesPerSecond = progress.completed / elapsed;

            if (scrapingStatus.propertiesPerSecond > 0) {
                const remaining = scrapingStatus.total - progress.completed;
                scrapingStatus.estimatedTimeRemaining = Math.ceil(remaining / scrapingStatus.propertiesPerSecond);
            }
        });

        // Save results
        await saveProperties(results);

        const duration = (Date.now() - scrapingStatus.startTime) / 1000;

        scrapingStatus.isRunning = false;
        scrapingStatus.progress = scrapingStatus.total;

        console.log(`\n✅ Fast scraping complete!`);
        console.log(`   Total: ${results.length} properties`);
        console.log(`   Time: ${duration.toFixed(1)} seconds`);
        console.log(`   Speed: ${(results.length / duration).toFixed(1)} properties/second`);

    } catch (error) {
        console.error('Fast scraping error:', error);
        scrapingStatus.errors.push(error.message);
        scrapingStatus.isRunning = false;
    } finally {
        await scraper.close();
    }
}

// Test endpoint for quick parallel scraping
app.post('/api/test-fast', async (req, res) => {
    const testRange = {
        startId: 250900000,
        endId: 250900050,
        workerCount: 5
    };

    res.json({
        success: true,
        message: 'Test fast scraping started',
        ...testRange
    });

    fastScrapeProperties(testRange.startId, testRange.endId, testRange.workerCount);
});

// Zillow data endpoints
let zillowStatus = {
    isRunning: false,
    progress: 0,
    total: 0,
    success: 0,
    failed: 0,
    startTime: null
};

// Get Zillow data
app.get('/api/zillow-data', async (req, res) => {
    try {
        const zillowFile = path.join(DATA_DIR, 'zillow-data.json');
        const data = await fs.readFile(zillowFile, 'utf8');
        const zillowData = JSON.parse(data);
        res.json({
            success: true,
            count: Object.keys(zillowData).length,
            data: zillowData
        });
    } catch (error) {
        res.json({
            success: true,
            count: 0,
            data: {}
        });
    }
});

// Get Zillow fetch status
app.get('/api/zillow-status', (req, res) => {
    res.json(zillowStatus);
});

// Fetch Zillow data for all properties
app.post('/api/fetch-zillow', async (req, res) => {
    if (zillowStatus.isRunning) {
        return res.status(400).json({
            success: false,
            error: 'Zillow fetch already in progress'
        });
    }

    res.json({
        success: true,
        message: 'Zillow data fetch started'
    });

    // Start fetching in background
    fetchZillowData();
});

// Background Zillow fetching
async function fetchZillowData() {
    const apiKey = process.env.RAPIDAPI_KEY || '435eeaf287msh252959294ebf8abp1d39bbjsnc04db0da6d18';
    const fetcher = new ZillowFetcher(apiKey);

    zillowStatus = {
        isRunning: true,
        progress: 0,
        total: 0,
        success: 0,
        failed: 0,
        startTime: new Date()
    };

    try {
        await fetcher.initialize();

        // Load properties
        const properties = await loadProperties();
        zillowStatus.total = properties.length;

        console.log(`\n🏠 Starting Zillow fetch for ${properties.length} properties\n`);

        // Process in batches with progress updates
        for (let i = 0; i < properties.length; i++) {
            const property = properties[i];

            if (property.address) {
                const result = await fetcher.fetchPropertyDetails(
                    property.address,
                    property.city || 'DETROIT',
                    'MI',
                    property.zip || ''
                );

                if (result && !result.notFound) {
                    zillowStatus.success++;
                } else {
                    zillowStatus.failed++;
                }
            }

            zillowStatus.progress = i + 1;

            // Small delay for rate limiting
            if (i < properties.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1100));
            }
        }

        console.log(`\n✅ Zillow fetch complete!`);
        console.log(`   Success: ${zillowStatus.success}`);
        console.log(`   Failed: ${zillowStatus.failed}\n`);

    } catch (error) {
        console.error('Zillow fetch error:', error);
    } finally {
        zillowStatus.isRunning = false;
    }
}

// API endpoint for analytics dashboard
app.get('/api/analytics/summary', async (req, res) => {
    try {
        // Load properties and Zillow data
        const properties = await loadProperties();
        const zillowData = await loadZillowData();

        // Load geocoded data
        let geocodeData = {};
        try {
            const geocodeFile = path.join(DATA_DIR, 'geocoded-properties.json');
            const geocodeContent = await fs.readFile(geocodeFile, 'utf8');
            geocodeData = JSON.parse(geocodeContent);
        } catch (error) {
            console.log('No geocode data available');
        }

        // Merge properties with Zillow and geocode data
        const mergedProperties = properties.map(prop => {
            const addressKey = getAddressKey(prop.address, prop.city);
            const zillow = zillowData[addressKey];
            const geocode = geocodeData[addressKey];

            // Fix bid status - if currentBid is "NONE", set hasBids to false
            const hasBids = prop.currentBid && prop.currentBid !== 'NONE';

            // Calculate competition level more accurately
            let competitionLevel = 'LOW';
            if (hasBids) {
                if (prop.currentBidNumeric && prop.minimumBidNumeric) {
                    const bidIncrease = (prop.currentBidNumeric - prop.minimumBidNumeric) / prop.minimumBidNumeric;
                    if (bidIncrease > 0.5) competitionLevel = 'HIGH';
                    else if (bidIncrease > 0.2) competitionLevel = 'MEDIUM';
                    else competitionLevel = 'MEDIUM';
                } else {
                    competitionLevel = 'MEDIUM';
                }
            }

            // Calculate ROI and metrics
            const roi = zillow && zillow.zestimate ?
                Math.round(((zillow.zestimate - prop.minimumBidNumeric) / prop.minimumBidNumeric * 100)) : 0;
            const potentialProfit = zillow && zillow.zestimate ?
                (zillow.zestimate - prop.minimumBidNumeric) : 0;
            const monthlyRentYield = zillow && zillow.rentZestimate ?
                (zillow.rentZestimate / prop.minimumBidNumeric * 100) : 0;

            // Create links
            const links = {
                auction: `https://www.waynecountytreasurermi.com/AuctionPropertyDetails.aspx?AI_ID=${prop.auctionId}`,
                zillow: zillow && zillow.hdpUrl ? zillow.hdpUrl : null,
                streetView: geocode && geocode.latitude && geocode.longitude ?
                    `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${geocode.latitude},${geocode.longitude}` :
                    null
            };

            // Get property image
            const images = {
                primary: zillow && zillow.imgSrc ? zillow.imgSrc : null,
                streetView: zillow && zillow.streetView ? zillow.streetView : null
            };

            return {
                ...prop,
                hasBids,
                zillow: zillow && !zillow.notFound ? zillow : null,
                geocode: geocode && geocode.latitude ? geocode : null,
                images,
                links,
                analytics: {
                    overallScore: calculateScore(prop, zillow),
                    isHiddenGem: !hasBids && roi > 200,
                    isHotProperty: hasBids && competitionLevel === 'HIGH',
                    competitionLevel,
                    recommendation: getRecommendation(prop, zillow),
                    metrics: {
                        roi,
                        potentialProfit: Math.round(potentialProfit),
                        monthlyRentYield: Math.round(monthlyRentYield * 10) / 10,
                        pricePerSqFt: zillow && zillow.livingArea ?
                            Math.round(prop.minimumBidNumeric / zillow.livingArea) : null
                    },
                    strategy: {
                        profit: {
                            roi,
                            potential: potentialProfit,
                            rating: roi > 200 ? 'Excellent' : roi > 100 ? 'Good' : roi > 50 ? 'Fair' : 'Poor'
                        },
                        competition: {
                            level: competitionLevel,
                            score: competitionLevel === 'LOW' ? 30 : competitionLevel === 'MEDIUM' ? 60 : 90
                        }
                    }
                }
            };
        }).filter(p => p.biddingCloses && p.biddingCloses !== 'N/A'); // Filter out bundles

        // Calculate statistics
        const stats = {
            total: mergedProperties.length,
            withBids: mergedProperties.filter(p => p.hasBids).length,
            withoutBids: mergedProperties.filter(p => !p.hasBids).length,
            withZillow: mergedProperties.filter(p => p.zillow).length,
            withGeocode: mergedProperties.filter(p => p.geocode).length,
            withImages: mergedProperties.filter(p => p.images?.primary).length,
            competition: {
                low: mergedProperties.filter(p => p.analytics.competitionLevel === 'LOW').length,
                medium: mergedProperties.filter(p => p.analytics.competitionLevel === 'MEDIUM').length,
                high: mergedProperties.filter(p => p.analytics.competitionLevel === 'HIGH').length
            },
            priceRanges: {
                under1k: mergedProperties.filter(p => p.minimumBidNumeric < 1000).length,
                under5k: mergedProperties.filter(p => p.minimumBidNumeric < 5000).length,
                under10k: mergedProperties.filter(p => p.minimumBidNumeric < 10000).length,
                over10k: mergedProperties.filter(p => p.minimumBidNumeric >= 10000).length
            },
            averageMinBid: Math.round(
                mergedProperties.reduce((sum, p) => sum + p.minimumBidNumeric, 0) / mergedProperties.length
            )
        };

        // Get last modified time of properties.json
        let lastModified = null;
        try {
            const statsFile = await fs.stat(path.join(DATA_DIR, 'properties.json'));
            lastModified = statsFile.mtime;
        } catch (error) {
            console.log('Could not get file stats');
        }

        res.json({
            success: true,
            properties: mergedProperties,
            stats,
            hiddenGems: mergedProperties.filter(p => p.analytics.isHiddenGem),
            lastUpdate: new Date().toISOString(),
            lastModified: lastModified,
            summary: {
                totalProperties: stats.total,
                propertiesWithBids: stats.withBids,
                propertiesWithZillow: stats.withZillow,
                propertiesWithImages: stats.withImages,
                averageScore: Math.round(
                    mergedProperties.reduce((sum, p) => sum + p.analytics.overallScore, 0) / mergedProperties.length
                )
            }
        });
    } catch (error) {
        console.error('Error in analytics summary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load analytics data',
            message: error.message
        });
    }
});

// Helper functions for analytics
function getAddressKey(address, city = 'DETROIT') {
    if (!address) return null;
    return `${address}_${city}_MI_`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_');
}

function calculateScore(property, zillow) {
    let score = 50; // Base score

    // Add points for good ROI
    if (zillow && zillow.zestimate) {
        const roi = (zillow.zestimate - property.minimumBidNumeric) / property.minimumBidNumeric;
        if (roi > 2) score += 30;
        else if (roi > 1) score += 20;
        else if (roi > 0.5) score += 10;
    }

    // Reduce score if has bids (competition)
    if (property.hasBids || (property.currentBid && property.currentBid !== 'NONE')) {
        score -= 20;
    }

    return Math.min(100, Math.max(0, score));
}

function getRecommendation(property, zillow) {
    const score = calculateScore(property, zillow);
    const hasBids = property.currentBid && property.currentBid !== 'NONE';

    if (score >= 80 && !hasBids) return 'STRONG BUY - Excellent opportunity';
    if (score >= 60) return 'GOOD BUY - Worth considering';
    if (score >= 40) return 'CONSIDER - Research further';
    return 'SKIP - Better options available';
}

// Get bid history data
app.get('/api/bid-history', async (req, res) => {
    try {
        const bidHistoryFile = path.join(DATA_DIR, 'bid-history', 'bid-history.json');
        const data = await fs.readFile(bidHistoryFile, 'utf8');
        const bidHistory = JSON.parse(data);
        res.json({
            success: true,
            data: bidHistory
        });
    } catch (error) {
        res.json({
            success: true,
            data: {}
        });
    }
});

// Refresh single property
app.post('/api/refresh-property/:auctionId', async (req, res) => {
    const { auctionId } = req.params;

    if (!auctionId) {
        return res.status(400).json({
            success: false,
            error: 'Auction ID is required'
        });
    }

    // Send immediate response
    res.json({
        success: true,
        message: `Refreshing property ${auctionId}`
    });

    // Refresh in background using parallel scraper with single ID
    const scraper = new ParallelAuctionScraper({
        username: process.env.AUCTION_USER || 'jacob.e.durrah@gmail.com',
        password: process.env.AUCTION_PASSWORD || 'Bogieman@12j',
        workerCount: 1,
        headless: true
    });

    try {
        await scraper.initialize();
        const results = await scraper.scrapeRange(parseInt(auctionId), parseInt(auctionId));

        if (results.length > 0) {
            // Update the property in the properties file
            const properties = await loadProperties();
            const index = properties.findIndex(p => p.auctionId === auctionId);
            if (index >= 0) {
                properties[index] = results[0];
                await saveProperties(properties);
            }
        }
    } catch (error) {
        console.error('Error refreshing property:', error);
    } finally {
        await scraper.close();
    }
});

// Serve the new HTML with tabs
app.get('/tabs', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index-with-tabs.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`
⚡ Fast Auction Scraper Server Running
======================================
Local URL: http://localhost:${PORT}
Dashboard: http://localhost:${PORT}/tabs
API Endpoints:
  - GET  /api/properties      (Get all properties)
  - GET  /api/status          (Get scraping status)
  - POST /api/fast-scrape     (Start parallel scraping)
  - POST /api/test-fast       (Test with 50 properties)
  - GET  /api/zillow-data     (Get Zillow data)
  - GET  /api/zillow-status   (Get Zillow fetch status)
  - POST /api/fetch-zillow    (Start Zillow fetch)
======================================
Default: 10 workers for maximum speed
======================================
    `);
    ensureDataDir();
});