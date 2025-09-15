const WayneCountyAuctionScraper = require('./auction-scraper');
require('dotenv').config();

async function testScraper() {
    console.log('=== Wayne County Auction Scraper Test ===\n');

    // Configuration
    const config = {
        username: process.env.AUCTION_USER || 'jacob.e.durrah@gmail.com',
        password: process.env.AUCTION_PASSWORD || 'Bogieman@12j',
        headless: false // Set to false to see the browser
    };

    console.log('Configuration:');
    console.log(`- Username: ${config.username}`);
    console.log(`- Password: ${config.password ? '***' : 'NOT SET'}`);
    console.log(`- Headless: ${config.headless}\n`);

    const scraper = new WayneCountyAuctionScraper(config);

    try {
        // Step 1: Initialize browser
        console.log('Step 1: Initializing browser...');
        await scraper.initialize();
        console.log('✓ Browser initialized\n');

        // Step 2: Login
        console.log('Step 2: Logging in...');
        const loginSuccess = await scraper.login();
        if (!loginSuccess) {
            throw new Error('Login failed - check credentials');
        }
        console.log('✓ Login successful\n');

        // Step 3: Test single property scrape
        console.log('Step 3: Testing single property scrape...');
        const testId = 250900001;
        console.log(`Scraping property ID: ${testId}`);
        const singleProperty = await scraper.scrapePropertyById(testId);

        if (singleProperty) {
            console.log('✓ Property found:');
            console.log(`  - Address: ${singleProperty.address}`);
            console.log(`  - City: ${singleProperty.city}`);
            console.log(`  - Parcel ID: ${singleProperty.parcelId}`);
            console.log(`  - Minimum Bid: ${singleProperty.minimumBid}`);
            console.log(`  - Current Bid: ${singleProperty.currentBid}`);
            console.log(`  - Status: ${singleProperty.status}`);
            console.log(`  - SEV: ${singleProperty.sevValue}\n`);
        } else {
            console.log('✗ Property not found\n');
        }

        // Step 4: Test batch scrape
        console.log('Step 4: Testing batch scrape...');
        const startId = 250900000;
        const endId = 250900005;
        console.log(`Scraping range: ${startId} to ${endId}`);

        const batchResults = await scraper.scrapePropertyRange(startId, endId, {
            batchSize: 3,
            delayMs: 1000,
            onProgress: (progress) => {
                console.log(`  Progress: ${progress.current - startId + 1}/${progress.total} (Success: ${progress.successCount}, Failed: ${progress.failCount})`);
            }
        });

        console.log(`\n✓ Batch scrape complete:`);
        console.log(`  - Total properties found: ${batchResults.length}`);
        console.log(`  - Properties with bids: ${batchResults.filter(p => p.hasBids).length}`);
        console.log(`  - Total minimum bids: $${batchResults.reduce((sum, p) => sum + (p.minimumBidNumeric || 0), 0).toLocaleString()}`);

        // Step 5: Test address search (optional)
        console.log('\nStep 5: Testing address search...');
        const searchResults = await scraper.searchByAddress('1234', 'Main');
        console.log(`✓ Search found ${searchResults.length} results\n`);

        // Display summary of all scraped properties
        console.log('=== Summary of Scraped Properties ===');
        batchResults.forEach((property, index) => {
            console.log(`\n${index + 1}. Property ${property.auctionId}:`);
            console.log(`   Address: ${property.address || 'N/A'}, ${property.city || 'N/A'}`);
            console.log(`   Min Bid: ${property.minimumBid || 'N/A'}`);
            console.log(`   Current: ${property.currentBid || 'No bids'}`);
            console.log(`   Status: ${property.status || 'N/A'}`);
        });

        // Save results to file
        const fs = require('fs').promises;
        const outputFile = `auction-scrape-${Date.now()}.json`;
        await fs.writeFile(outputFile, JSON.stringify(batchResults, null, 2));
        console.log(`\n✓ Results saved to ${outputFile}`);

    } catch (error) {
        console.error('\n✗ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        // Always close the browser
        console.log('\nClosing browser...');
        await scraper.close();
        console.log('✓ Browser closed');
    }
}

// Run the test
testScraper().then(() => {
    console.log('\n=== Test Complete ===');
    process.exit(0);
}).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});