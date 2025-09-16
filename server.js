const express = require('express');
const cors = require('cors');
const compression = require('compression');
const fs = require('fs').promises;
const path = require('path');
const WayneCountyAuctionScraper = require('./auction-scraper');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.static('public'));

// Data storage
const DATA_DIR = path.join(__dirname, 'data');
const PROPERTIES_FILE = path.join(DATA_DIR, 'properties.json');

// Scraping status
let scrapingStatus = {
    isRunning: false,
    progress: 0,
    total: 0,
    currentId: null,
    startTime: null,
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

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get all properties
app.get('/api/properties', async (req, res) => {
    try {
        const properties = await loadProperties();
        res.json({
            success: true,
            count: properties.length,
            properties: properties
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get scraping status
app.get('/api/status', (req, res) => {
    res.json(scrapingStatus);
});

// Scrape all properties
app.post('/api/scrape', async (req, res) => {
    if (scrapingStatus.isRunning) {
        return res.status(400).json({
            success: false,
            error: 'Scraping already in progress'
        });
    }

    const startId = parseInt(process.env.SCRAPE_START_ID) || 250900000;
    const endId = parseInt(process.env.SCRAPE_END_ID) || 250902570;

    // Send immediate response
    res.json({
        success: true,
        message: 'Scraping started',
        range: { startId, endId }
    });

    // Start scraping in background
    scrapeProperties(startId, endId);
});

// Scrape specific range
app.post('/api/scrape-range', async (req, res) => {
    if (scrapingStatus.isRunning) {
        return res.status(400).json({
            success: false,
            error: 'Scraping already in progress'
        });
    }

    const { startId, endId } = req.body;

    if (!startId || !endId) {
        return res.status(400).json({
            success: false,
            error: 'startId and endId required'
        });
    }

    res.json({
        success: true,
        message: 'Scraping started',
        range: { startId, endId }
    });

    scrapeProperties(parseInt(startId), parseInt(endId));
});

// Background scraping function
async function scrapeProperties(startId, endId) {
    const scraper = new WayneCountyAuctionScraper({
        username: process.env.AUCTION_USER || 'jacob.e.durrah@gmail.com',
        password: process.env.AUCTION_PASSWORD || 'Bogieman@12j',
        headless: true
    });

    // Update status
    scrapingStatus = {
        isRunning: true,
        progress: 0,
        total: endId - startId + 1,
        currentId: startId,
        startTime: new Date(),
        errors: []
    };

    try {
        await scraper.initialize();
        const loginSuccess = await scraper.login();

        if (!loginSuccess) {
            throw new Error('Failed to login to auction site');
        }

        const results = [];
        const batchSize = 50; // Process in batches

        for (let id = startId; id <= endId; id += batchSize) {
            const batchEnd = Math.min(id + batchSize - 1, endId);

            console.log(`Scraping batch ${id} to ${batchEnd}`);

            const batchResults = await scraper.scrapePropertyRange(id, batchEnd, {
                batchSize: 10,
                delayMs: 500,
                onProgress: (progress) => {
                    scrapingStatus.progress = (id - startId) + progress.current - id;
                    scrapingStatus.currentId = progress.current;
                }
            });

            results.push(...batchResults);

            // Save intermediate results
            if (results.length > 0) {
                await saveProperties(results);
            }
        }

        // Save final results
        await saveProperties(results);

        scrapingStatus.isRunning = false;
        scrapingStatus.progress = scrapingStatus.total;
        console.log(`Scraping complete: ${results.length} properties`);

    } catch (error) {
        console.error('Scraping error:', error);
        scrapingStatus.errors.push(error.message);
        scrapingStatus.isRunning = false;
    } finally {
        await scraper.close();
    }
}

// Start server
app.listen(PORT, () => {
    console.log(`
🏠 Auction Dashboard Server Running
====================================
Local URL: http://localhost:${PORT}
API Endpoints:
  - GET  /api/properties     (Get all properties)
  - GET  /api/status         (Get scraping status)
  - POST /api/scrape         (Start full scrape)
  - POST /api/scrape-range   (Scrape specific range)
====================================
    `);
    ensureDataDir();
});