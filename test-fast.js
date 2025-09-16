#!/usr/bin/env node

const ParallelAuctionScraper = require('./parallel-scraper');
require('dotenv').config();

async function testFastScraping() {
    console.log('⚡ Testing Fast Parallel Scraping\n');

    // Test with a small range
    const startId = 250900000;
    const endId = 250900050;  // Just 50 properties for testing
    const workerCount = 5;

    console.log(`📊 Test Configuration:`);
    console.log(`   Range: ${startId} to ${endId} (${endId - startId + 1} properties)`);
    console.log(`   Workers: ${workerCount}`);
    console.log(`   Expected time: ~${Math.ceil((endId - startId + 1) / (workerCount * 10))} seconds\n`);

    const scraper = new ParallelAuctionScraper({
        username: process.env.AUCTION_USER || 'jacob.e.durrah@gmail.com',
        password: process.env.AUCTION_PASSWORD || 'Bogieman@12j',
        workerCount: workerCount,
        headless: true
    });

    try {
        const startTime = Date.now();

        await scraper.initialize();
        const results = await scraper.scrapeRange(startId, endId);

        const duration = (Date.now() - startTime) / 1000;

        console.log(`\n📈 Test Results:`);
        console.log(`   Properties scraped: ${results.length}`);
        console.log(`   Total time: ${duration.toFixed(1)} seconds`);
        console.log(`   Speed: ${(results.length / duration).toFixed(1)} properties/second`);
        console.log(`   Speedup: ${(10 / (results.length / duration)).toFixed(1)}x faster than serial`);

        // Show sample data
        if (results.length > 0) {
            console.log(`\n📋 Sample property:`);
            const sample = results[0];
            console.log(`   ID: ${sample.auctionId}`);
            console.log(`   Address: ${sample.address}`);
            console.log(`   Min Bid: ${sample.minimumBid}`);
            console.log(`   Status: ${sample.status}`);
        }

        // Calculate full scraping estimate
        const fullRange = 2570;  // 250900000 to 250902570
        const estimatedFullTime = (fullRange / results.length) * duration;

        console.log(`\n⏱️  Estimated time for full scrape (2570 properties):`);
        console.log(`   With ${workerCount} workers: ${(estimatedFullTime / 60).toFixed(1)} minutes`);
        console.log(`   With 10 workers: ${(estimatedFullTime / 60 * (workerCount / 10)).toFixed(1)} minutes`);
        console.log(`   With 20 workers: ${(estimatedFullTime / 60 * (workerCount / 20)).toFixed(1)} minutes`);

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await scraper.close();
    }
}

// Run the test
testFastScraping();