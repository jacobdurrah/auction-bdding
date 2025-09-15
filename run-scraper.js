const WayneCountyAuctionScraper = require('./auction-scraper');
const fs = require('fs').promises;
require('dotenv').config();

async function runScraper() {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const startId = args[0] ? parseInt(args[0]) : 250900000;
    const endId = args[1] ? parseInt(args[1]) : 250900010;

    console.log('=== Wayne County Auction Scraper ===');
    console.log(`Range: ${startId} to ${endId}`);
    console.log(`Time: ${new Date().toISOString()}\n`);

    const scraper = new WayneCountyAuctionScraper({
        username: process.env.AUCTION_USER || 'jacob.e.durrah@gmail.com',
        password: process.env.AUCTION_PASSWORD || 'Bogieman@12j',
        headless: process.env.SCRAPER_HEADLESS !== 'false'
    });

    try {
        // Initialize and login
        await scraper.initialize();
        const loginSuccess = await scraper.login();

        if (!loginSuccess) {
            throw new Error('Failed to login to auction site');
        }

        // Scrape properties
        const results = await scraper.scrapePropertyRange(startId, endId, {
            batchSize: parseInt(process.env.SCRAPER_BATCH_SIZE) || 10,
            delayMs: parseInt(process.env.SCRAPER_DELAY_MS) || 1000,
            onProgress: (progress) => {
                const percent = Math.round((progress.current - startId + 1) / progress.total * 100);
                console.log(`[${percent}%] Property ${progress.current}: Success=${progress.successCount}, Failed=${progress.failCount}`);
            }
        });

        // Save results
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputFile = `auction-data-${timestamp}.json`;
        await fs.writeFile(outputFile, JSON.stringify(results, null, 2));

        // Print summary
        console.log('\n=== Scraping Complete ===');
        console.log(`Total properties: ${results.length}`);
        console.log(`Properties with bids: ${results.filter(p => p.hasBids).length}`);
        console.log(`Output saved to: ${outputFile}`);

        // Create CSV for easy viewing
        const csvFile = `auction-data-${timestamp}.csv`;
        const csvContent = convertToCSV(results);
        await fs.writeFile(csvFile, csvContent);
        console.log(`CSV saved to: ${csvFile}`);

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    } finally {
        await scraper.close();
    }
}

function convertToCSV(data) {
    if (data.length === 0) return '';

    // Define the columns we want in the CSV
    const columns = [
        'auctionId',
        'parcelId',
        'address',
        'city',
        'zip',
        'minimumBid',
        'currentBid',
        'hasBids',
        'status',
        'sevValue',
        'biddingCloses',
        'summerTax',
        'winterTax'
    ];

    // Create header
    const header = columns.join(',');

    // Create rows
    const rows = data.map(item => {
        return columns.map(col => {
            let value = item[col] || '';
            // Escape commas and quotes in values
            if (value.toString().includes(',') || value.toString().includes('"')) {
                value = `"${value.toString().replace(/"/g, '""')}"`;
            }
            return value;
        }).join(',');
    });

    return [header, ...rows].join('\n');
}

// Run the scraper
runScraper().then(() => {
    console.log('\nDone!');
    process.exit(0);
}).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});