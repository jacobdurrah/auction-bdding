const { chromium } = require('playwright');
const { parentPort, workerData } = require('worker_threads');

// Worker-specific scraper for parallel execution
async function runWorker() {
    const { workerId, startId, endId, baseUrl, cookies, storageState, headless } = workerData;

    let browser = null;
    let context = null;

    try {
        // Launch browser for this worker
        browser = await chromium.launch({
            headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        });

        // Create context with saved cookies/storage
        context = await browser.newContext({
            ...storageState,
            userAgent: `Mozilla/5.0 Worker${workerId} (Windows NT 10.0; Win64; x64)`,
            viewport: { width: 1280, height: 720 }
        });

        // Add cookies from master session
        if (cookies && cookies.length > 0) {
            await context.addCookies(cookies);
        }

        const page = await context.newPage();
        page.setDefaultTimeout(15000); // Shorter timeout for speed

        // Disable images and CSS for faster loading
        await page.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2,ttf}', route => route.abort());

        parentPort.postMessage({
            type: 'status',
            message: `Worker ${workerId} started: ${startId} to ${endId}`
        });

        // Scrape properties in this worker's range
        for (let id = startId; id <= endId; id++) {
            try {
                const url = `${baseUrl}/AuctionPropertyDetails.aspx?AI_ID=${id}`;

                // Navigate to property page
                await page.goto(url, {
                    waitUntil: 'domcontentloaded', // Faster than networkidle
                    timeout: 10000
                });

                // Quick check if property exists
                const notFound = await page.$('text=/property not found/i');
                if (notFound) {
                    parentPort.postMessage({
                        type: 'progress',
                        current: id,
                        total: endId - startId + 1
                    });
                    continue;
                }

                // Extract property data efficiently
                const propertyData = await page.evaluate(() => {
                    const getText = (id) => {
                        const el = document.getElementById(id);
                        return el ? el.textContent.trim() : null;
                    };

                    return {
                        parcelId: getText('ContentPlaceHolder1_lblPIN'),
                        address: getText('ContentPlaceHolder1_lblAddress'),
                        city: getText('ContentPlaceHolder1_lblCity'),
                        zip: getText('ContentPlaceHolder1_lblZip'),
                        legalDescription: getText('ContentPlaceHolder1_lblLegalDesc'),
                        sevValue: getText('ContentPlaceHolder1_lblSEV'),
                        auctionId: getText('ContentPlaceHolder1_lblAI_ID'),
                        status: getText('ContentPlaceHolder1_lblStatus'),
                        biddingCloses: getText('ContentPlaceHolder1_lblAuctionCloses'),
                        currentBid: getText('ContentPlaceHolder1_lblCurrent_Bid'),
                        minimumBid: getText('ContentPlaceHolder1_lblMinBid'),
                        summerTax: getText('ContentPlaceHolder1_lblSummerTax'),
                        winterTax: getText('ContentPlaceHolder1_lblWinterTax'),
                        scrapedAt: new Date().toISOString()
                    };
                });

                // Skip if no data
                if (!propertyData.auctionId && !propertyData.address) {
                    parentPort.postMessage({
                        type: 'progress',
                        current: id,
                        total: endId - startId + 1
                    });
                    continue;
                }

                // Skip properties that have been removed from auction
                if (propertyData.status &&
                    (propertyData.status.toLowerCase().includes('removed') ||
                     propertyData.status === 'Removed from Auction')) {
                    parentPort.postMessage({
                        type: 'progress',
                        current: id,
                        total: endId - startId + 1
                    });
                    continue;
                }

                // Parse numeric values
                propertyData.auctionId = id.toString();
                propertyData.minimumBidNumeric = parseFloat((propertyData.minimumBid || '').replace(/[$,]/g, '')) || 0;
                propertyData.currentBidNumeric = parseFloat((propertyData.currentBid || '').replace(/[$,]/g, '')) || 0;
                propertyData.sevValueNumeric = parseFloat((propertyData.sevValue || '').replace(/[$,]/g, '')) || 0;
                propertyData.hasBids = propertyData.currentBid && propertyData.currentBid !== '' && propertyData.currentBid !== '$0.00';

                // Send result to main thread
                parentPort.postMessage({
                    type: 'result',
                    data: propertyData
                });

                // Send progress update
                parentPort.postMessage({
                    type: 'progress',
                    current: id,
                    total: endId - startId + 1
                });

                // Small delay to avoid overwhelming the server
                if (id % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

            } catch (error) {
                parentPort.postMessage({
                    type: 'error',
                    error: `Failed to scrape ${id}: ${error.message}`
                });

                // Continue to next property
                parentPort.postMessage({
                    type: 'progress',
                    current: id,
                    total: endId - startId + 1
                });
            }
        }

        parentPort.postMessage({
            type: 'complete',
            workerId
        });

    } catch (error) {
        parentPort.postMessage({
            type: 'error',
            error: error.message
        });
        throw error;

    } finally {
        // Clean up
        if (context) await context.close();
        if (browser) await browser.close();
    }
}

// Start the worker
runWorker().catch(error => {
    console.error(`Worker ${workerData.workerId} fatal error:`, error);
    process.exit(1);
});