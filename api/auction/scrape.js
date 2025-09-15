const WayneCountyAuctionScraper = require('../../auction-scraper');

// API endpoint handler for Vercel
module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Parse request parameters
    const {
        startId = 250900000,
        endId = 250900010,
        auctionIds = null,
        username = process.env.AUCTION_USER,
        password = process.env.AUCTION_PASSWORD,
        batchSize = 10,
        delayMs = 1000
    } = req.method === 'POST' ? req.body : req.query;

    // Validate input
    if (!username || !password) {
        return res.status(400).json({
            error: 'Authentication credentials required',
            message: 'Please provide username and password or set AUCTION_USER and AUCTION_PASSWORD environment variables'
        });
    }

    // Initialize scraper
    const scraper = new WayneCountyAuctionScraper({
        username,
        password,
        headless: true // Always run headless in production
    });

    try {
        // Initialize browser
        await scraper.initialize();

        // Login
        const loginSuccess = await scraper.login();
        if (!loginSuccess) {
            throw new Error('Failed to authenticate with auction site');
        }

        let results = [];

        if (auctionIds && Array.isArray(auctionIds)) {
            // Scrape specific auction IDs
            console.log(`Scraping ${auctionIds.length} specific properties`);
            for (const id of auctionIds) {
                const property = await scraper.scrapePropertyById(id);
                if (property) {
                    results.push(property);
                }
                // Small delay between requests
                await scraper.delay(500);
            }
        } else {
            // Scrape range of IDs
            const start = parseInt(startId);
            const end = parseInt(endId);

            if (isNaN(start) || isNaN(end) || start > end) {
                throw new Error('Invalid ID range');
            }

            // Limit range for API calls to prevent timeout
            const maxRange = 100;
            if (end - start > maxRange) {
                throw new Error(`Range too large. Maximum ${maxRange} properties per request`);
            }

            results = await scraper.scrapePropertyRange(start, end, {
                batchSize: parseInt(batchSize),
                delayMs: parseInt(delayMs),
                onProgress: (progress) => {
                    console.log(`Progress: ${progress.current}/${progress.total}`);
                }
            });
        }

        // Close browser
        await scraper.close();

        // Return results
        return res.status(200).json({
            success: true,
            count: results.length,
            properties: results,
            summary: {
                totalProperties: results.length,
                propertiesWithBids: results.filter(p => p.hasBids).length,
                totalMinimumBids: results.reduce((sum, p) => sum + (p.minimumBidNumeric || 0), 0),
                totalCurrentBids: results.reduce((sum, p) => sum + (p.currentBidNumeric || 0), 0)
            }
        });

    } catch (error) {
        console.error('Scraping error:', error);

        // Clean up on error
        try {
            await scraper.close();
        } catch (e) {
            console.error('Error closing browser:', e);
        }

        return res.status(500).json({
            success: false,
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};