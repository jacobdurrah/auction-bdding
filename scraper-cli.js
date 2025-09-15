#!/usr/bin/env node

const WayneCountyAuctionScraper = require('./auction-scraper');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

function showHelp() {
    console.log(`
Wayne County Auction Scraper CLI

Usage:
  node scraper-cli.js <command> [options]

Commands:
  single <id>              Scrape a single property by auction ID
  range <start> <end>      Scrape a range of properties
  search <number> <street> Search for properties by address
  help                     Show this help message

Examples:
  node scraper-cli.js single 250900001
  node scraper-cli.js range 250900000 250900100
  node scraper-cli.js search 123 "Main Street"

Environment Variables:
  AUCTION_USER     Your auction site username
  AUCTION_PASSWORD Your auction site password
  SCRAPER_HEADLESS Run browser in headless mode (true/false)
    `);
}

async function scrapeSingle(auctionId) {
    const scraper = new WayneCountyAuctionScraper({
        username: process.env.AUCTION_USER || 'jacob.e.durrah@gmail.com',
        password: process.env.AUCTION_PASSWORD || 'Bogieman@12j',
        headless: process.env.SCRAPER_HEADLESS !== 'false'
    });

    try {
        await scraper.initialize();
        await scraper.login();

        console.log(`Scraping property ${auctionId}...`);
        const property = await scraper.scrapePropertyById(auctionId);

        if (property) {
            console.log('\n=== Property Details ===');
            console.log(`Auction ID: ${property.auctionId}`);
            console.log(`Address: ${property.address}, ${property.city} ${property.zip}`);
            console.log(`Parcel ID: ${property.parcelId}`);
            console.log(`Status: ${property.status}`);
            console.log(`Minimum Bid: ${property.minimumBid}`);
            console.log(`Current Bid: ${property.currentBid || 'No bids'}`);
            console.log(`SEV Value: ${property.sevValue}`);
            console.log(`Closes: ${property.biddingCloses}`);

            // Save to file
            const filename = `property-${auctionId}-${Date.now()}.json`;
            await fs.writeFile(filename, JSON.stringify(property, null, 2));
            console.log(`\nData saved to: ${filename}`);
        } else {
            console.log(`Property ${auctionId} not found or error occurred`);
        }
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await scraper.close();
    }
}

async function scrapeRange(startId, endId) {
    const scraper = new WayneCountyAuctionScraper({
        username: process.env.AUCTION_USER || 'jacob.e.durrah@gmail.com',
        password: process.env.AUCTION_PASSWORD || 'Bogieman@12j',
        headless: process.env.SCRAPER_HEADLESS !== 'false'
    });

    try {
        await scraper.initialize();
        await scraper.login();

        console.log(`Scraping properties from ${startId} to ${endId}...`);
        const properties = await scraper.scrapePropertyRange(startId, endId, {
            batchSize: parseInt(process.env.SCRAPER_BATCH_SIZE) || 10,
            delayMs: parseInt(process.env.SCRAPER_DELAY_MS) || 1000,
            onProgress: (progress) => {
                const percent = Math.round((progress.current - startId + 1) / progress.total * 100);
                process.stdout.write(`\r[${percent}%] ${progress.successCount} scraped, ${progress.failCount} failed`);
            }
        });

        console.log('\n\n=== Summary ===');
        console.log(`Total properties: ${properties.length}`);
        console.log(`Properties with bids: ${properties.filter(p => p.hasBids).length}`);

        // Save to files
        const timestamp = Date.now();
        const jsonFile = `range-${startId}-${endId}-${timestamp}.json`;
        const csvFile = `range-${startId}-${endId}-${timestamp}.csv`;

        await fs.writeFile(jsonFile, JSON.stringify(properties, null, 2));
        console.log(`\nJSON saved to: ${jsonFile}`);

        // Create CSV
        if (properties.length > 0) {
            const csv = convertToCSV(properties);
            await fs.writeFile(csvFile, csv);
            console.log(`CSV saved to: ${csvFile}`);
        }
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await scraper.close();
    }
}

async function searchAddress(streetNumber, streetName) {
    const scraper = new WayneCountyAuctionScraper({
        username: process.env.AUCTION_USER || 'jacob.e.durrah@gmail.com',
        password: process.env.AUCTION_PASSWORD || 'Bogieman@12j',
        headless: process.env.SCRAPER_HEADLESS !== 'false'
    });

    try {
        await scraper.initialize();
        await scraper.login();

        console.log(`Searching for: ${streetNumber} ${streetName}...`);
        const results = await scraper.searchByAddress(streetNumber, streetName);

        if (results.length > 0) {
            console.log(`\nFound ${results.length} properties:\n`);
            results.forEach((prop, index) => {
                console.log(`${index + 1}. ${prop.auctionId} - ${prop.address}, ${prop.city} (${prop.status})`);
            });

            // Save results
            const filename = `search-${streetNumber}-${streetName.replace(/\s+/g, '-')}-${Date.now()}.json`;
            await fs.writeFile(filename, JSON.stringify(results, null, 2));
            console.log(`\nResults saved to: ${filename}`);
        } else {
            console.log('No properties found');
        }
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await scraper.close();
    }
}

function convertToCSV(data) {
    if (data.length === 0) return '';

    const columns = [
        'auctionId', 'parcelId', 'address', 'city', 'zip',
        'minimumBid', 'currentBid', 'hasBids', 'status',
        'sevValue', 'biddingCloses', 'summerTax', 'winterTax'
    ];

    const header = columns.join(',');
    const rows = data.map(item => {
        return columns.map(col => {
            let value = item[col] || '';
            if (value.toString().includes(',') || value.toString().includes('"')) {
                value = `"${value.toString().replace(/"/g, '""')}"`;
            }
            return value;
        }).join(',');
    });

    return [header, ...rows].join('\n');
}

// Main execution
async function main() {
    if (!command || command === 'help') {
        showHelp();
        return;
    }

    switch (command) {
        case 'single':
            if (!args[1]) {
                console.error('Error: Auction ID required');
                showHelp();
                return;
            }
            await scrapeSingle(args[1]);
            break;

        case 'range':
            if (!args[1] || !args[2]) {
                console.error('Error: Start and end IDs required');
                showHelp();
                return;
            }
            const start = parseInt(args[1]);
            const end = parseInt(args[2]);
            if (isNaN(start) || isNaN(end) || start > end) {
                console.error('Error: Invalid range');
                return;
            }
            await scrapeRange(start, end);
            break;

        case 'search':
            if (!args[1] || !args[2]) {
                console.error('Error: Street number and name required');
                showHelp();
                return;
            }
            await searchAddress(args[1], args[2]);
            break;

        default:
            console.error(`Unknown command: ${command}`);
            showHelp();
    }
}

main().catch(console.error);