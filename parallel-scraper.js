const { chromium } = require('playwright');
const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs').promises;

class ParallelAuctionScraper {
    constructor(config = {}) {
        this.baseUrl = 'https://www.waynecountytreasurermi.com';
        this.username = config.username || process.env.AUCTION_USER;
        this.password = config.password || process.env.AUCTION_PASSWORD;
        this.workerCount = config.workerCount || 10;
        this.headless = config.headless !== false;
        this.masterBrowser = null;
        this.cookies = null;
        this.storageState = null;
        this.workers = [];
        this.results = [];
        this.progress = {
            total: 0,
            completed: 0,
            workersProgress: {}
        };
    }

    async initialize() {
        console.log(`🚀 Initializing parallel scraper with ${this.workerCount} workers`);

        // Launch master browser for login
        this.masterBrowser = await chromium.launch({
            headless: this.headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        // Login and save session
        await this.loginAndSaveSession();

        return true;
    }

    async loginAndSaveSession() {
        console.log('🔐 Logging in with master browser...');

        const context = await this.masterBrowser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            viewport: { width: 1280, height: 720 }
        });

        const page = await context.newPage();
        page.setDefaultTimeout(30000);

        try {
            // Navigate to login page
            await page.goto(this.baseUrl, { waitUntil: 'networkidle' });

            // Fill login form
            await page.fill('#txtUserName', this.username);
            await page.fill('#txtPassword', this.password);
            await page.click('#btnLogin');
            await page.waitForLoadState('networkidle');

            // Verify login success
            const testUrl = `${this.baseUrl}/AuctionPropertyDetails.aspx?AI_ID=250900001`;
            await page.goto(testUrl, { waitUntil: 'networkidle' });

            const propertyContent = await page.$('#ContentPlaceHolder1_lblPIN');
            if (!propertyContent) {
                throw new Error('Login failed - cannot access property pages');
            }

            console.log('✅ Login successful!');

            // Save cookies and storage state for workers
            this.cookies = await context.cookies();
            this.storageState = await context.storageState();

            await page.close();
            await context.close();

        } catch (error) {
            console.error('❌ Login failed:', error);
            throw error;
        }
    }

    async scrapeRange(startId, endId, onProgress) {
        this.progress.total = endId - startId + 1;
        this.progress.completed = 0;

        const rangePerWorker = Math.ceil((endId - startId + 1) / this.workerCount);
        const workerPromises = [];

        console.log(`📊 Splitting ${this.progress.total} properties across ${this.workerCount} workers`);
        console.log(`   Each worker handles ~${rangePerWorker} properties`);

        // Launch workers in parallel
        for (let i = 0; i < this.workerCount; i++) {
            const workerStart = startId + (i * rangePerWorker);
            const workerEnd = Math.min(workerStart + rangePerWorker - 1, endId);

            if (workerStart > endId) break;

            workerPromises.push(this.launchWorker(i, workerStart, workerEnd, onProgress));
        }

        // Wait for all workers to complete
        const startTime = Date.now();
        const workerResults = await Promise.all(workerPromises);

        // Combine results from all workers
        this.results = workerResults.flat();

        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        const propertiesPerSecond = this.results.length / duration;

        console.log(`\n✅ Parallel scraping complete!`);
        console.log(`   Total properties: ${this.results.length}`);
        console.log(`   Total time: ${duration.toFixed(1)} seconds`);
        console.log(`   Speed: ${propertiesPerSecond.toFixed(1)} properties/second`);

        return this.results;
    }

    async launchWorker(workerId, startId, endId, onProgress) {
        return new Promise((resolve, reject) => {
            const workerData = {
                workerId,
                startId,
                endId,
                baseUrl: this.baseUrl,
                cookies: this.cookies,
                storageState: this.storageState,
                headless: this.headless
            };

            const worker = new Worker(path.join(__dirname, 'worker-scraper.js'), {
                workerData
            });

            const workerResults = [];
            this.progress.workersProgress[workerId] = { current: 0, total: endId - startId + 1 };

            worker.on('message', (msg) => {
                if (msg.type === 'progress') {
                    this.progress.workersProgress[workerId].current = msg.current - startId + 1;
                    this.progress.completed = Object.values(this.progress.workersProgress)
                        .reduce((sum, w) => sum + w.current, 0);

                    if (onProgress) {
                        onProgress({
                            ...this.progress,
                            workerId,
                            workerProgress: msg
                        });
                    }

                    // Console progress update
                    const percent = Math.round((this.progress.completed / this.progress.total) * 100);
                    process.stdout.write(`\r[${percent}%] ${this.progress.completed}/${this.progress.total} properties | Worker ${workerId}: ${msg.current}`);

                } else if (msg.type === 'result') {
                    workerResults.push(msg.data);

                } else if (msg.type === 'error') {
                    console.error(`\n❌ Worker ${workerId} error:`, msg.error);

                } else if (msg.type === 'complete') {
                    console.log(`\n✓ Worker ${workerId} completed: ${workerResults.length} properties`);
                }
            });

            worker.on('error', (error) => {
                console.error(`\n❌ Worker ${workerId} crashed:`, error);
                reject(error);
            });

            worker.on('exit', (code) => {
                if (code !== 0) {
                    reject(new Error(`Worker ${workerId} stopped with exit code ${code}`));
                } else {
                    resolve(workerResults);
                }
            });
        });
    }

    async close() {
        if (this.masterBrowser) {
            await this.masterBrowser.close();
        }
    }
}

// Direct execution for testing
if (require.main === module) {
    async function runParallelScraper() {
        const scraper = new ParallelAuctionScraper({
            username: process.env.AUCTION_USER || 'jacob.e.durrah@gmail.com',
            password: process.env.AUCTION_PASSWORD || 'Bogieman@12j',
            workerCount: parseInt(process.env.WORKERS) || 10,
            headless: process.env.HEADLESS !== 'false'
        });

        try {
            await scraper.initialize();

            const startId = parseInt(process.env.START_ID) || 250900000;
            const endId = parseInt(process.env.END_ID) || 250900100;

            console.log(`\n🎯 Scraping range: ${startId} to ${endId}`);

            const results = await scraper.scrapeRange(startId, endId, (progress) => {
                // Progress is handled in the scrapeRange method
            });

            // Filter out bundle properties (those without closing times)
            const individualProperties = results.filter(p =>
                p.biddingCloses && p.biddingCloses !== 'N/A'
            );

            const bundleProperties = results.filter(p =>
                !p.biddingCloses || p.biddingCloses === 'N/A'
            );

            console.log(`\n📊 Filtering results:`);
            console.log(`   Individual properties: ${individualProperties.length}`);
            console.log(`   Bundle properties: ${bundleProperties.length}`);

            // Save results
            const dataDir = path.join(__dirname, 'data');
            await fs.mkdir(dataDir, { recursive: true });

            const outputFile = path.join(dataDir, 'properties.json');
            await fs.writeFile(outputFile, JSON.stringify(individualProperties, null, 2));

            // Also save bundles separately if needed
            if (bundleProperties.length > 0) {
                const bundleFile = path.join(dataDir, 'bundle-properties.json');
                await fs.writeFile(bundleFile, JSON.stringify(bundleProperties, null, 2));
                console.log(`   Bundle properties saved to: ${bundleFile}`);
            }

            console.log(`\n💾 Results saved to ${outputFile}`);

        } catch (error) {
            console.error('Fatal error:', error);
        } finally {
            await scraper.close();
        }
    }

    runParallelScraper();
}

module.exports = ParallelAuctionScraper;