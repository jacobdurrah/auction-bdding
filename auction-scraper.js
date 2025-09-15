const { chromium } = require('playwright');

class WayneCountyAuctionScraper {
    constructor(config = {}) {
        this.baseUrl = 'https://www.waynecountytreasurermi.com';
        this.username = config.username || process.env.AUCTION_USER;
        this.password = config.password || process.env.AUCTION_PASSWORD;
        this.headless = config.headless !== false;
        this.browser = null;
        this.context = null;
        this.page = null;
        this.isLoggedIn = false;
    }

    async initialize() {
        try {
            this.browser = await chromium.launch({
                headless: this.headless,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            this.context = await this.browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport: { width: 1280, height: 720 }
            });
            this.page = await this.context.newPage();

            // Set default timeout
            this.page.setDefaultTimeout(30000);

            console.log('Browser initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize browser:', error);
            throw error;
        }
    }

    async login() {
        if (this.isLoggedIn) {
            console.log('Already logged in');
            return true;
        }

        if (!this.username || !this.password) {
            console.error('Username and password are required for login');
            return false;
        }

        try {
            console.log('Navigating to login page...');
            await this.page.goto(this.baseUrl, { waitUntil: 'networkidle' });

            // Check if already on login page or need to navigate to it
            const loginForm = await this.page.$('#txtUserName');
            if (!loginForm) {
                // Try to find login link
                const loginLink = await this.page.$('a[href*="login"]');
                if (loginLink) {
                    await loginLink.click();
                    await this.page.waitForLoadState('networkidle');
                }
            }

            console.log('Filling login credentials...');

            // Fill in the login form
            await this.page.fill('#txtUserName', this.username);
            await this.page.fill('#txtPassword', this.password);

            // Click login button
            await this.page.click('#btnLogin');

            // Wait for navigation after login
            await this.page.waitForLoadState('networkidle');

            // Check if login was successful by looking for logout button or user info
            const logoutButton = await this.page.$('a[href*="logout"], #btnLogout');
            const loginError = await this.page.$('.error-message, .validation-summary-errors');

            if (loginError) {
                const errorText = await loginError.innerText();
                console.error('Login failed:', errorText);
                return false;
            }

            if (logoutButton) {
                console.log('Login successful!');
                this.isLoggedIn = true;
                return true;
            }

            // Alternative check: see if we can access property pages
            const testUrl = `${this.baseUrl}/AuctionPropertyDetails.aspx?AI_ID=250900001`;
            await this.page.goto(testUrl, { waitUntil: 'networkidle' });

            const propertyContent = await this.page.$('#ContentPlaceHolder1_lblPIN');
            if (propertyContent) {
                console.log('Login verified - can access property pages');
                this.isLoggedIn = true;
                return true;
            }

            console.warn('Login status uncertain');
            return false;

        } catch (error) {
            console.error('Login error:', error);
            return false;
        }
    }

    async scrapePropertyById(auctionId) {
        if (!this.isLoggedIn) {
            console.log('Not logged in, attempting login...');
            const loginSuccess = await this.login();
            if (!loginSuccess) {
                throw new Error('Failed to login');
            }
        }

        try {
            const url = `${this.baseUrl}/AuctionPropertyDetails.aspx?AI_ID=${auctionId}`;
            console.log(`Scraping property: ${auctionId}`);

            await this.page.goto(url, { waitUntil: 'networkidle' });

            // Check if property exists
            const notFoundText = await this.page.$('text=/property not found/i');
            if (notFoundText) {
                console.log(`Property ${auctionId} not found`);
                return null;
            }

            // Extract all property data
            const propertyData = await this.page.evaluate(() => {
                const getTextById = (id) => {
                    const element = document.getElementById(id);
                    return element ? element.textContent.trim() : null;
                };

                const getTextBySelector = (selector) => {
                    const element = document.querySelector(selector);
                    return element ? element.textContent.trim() : null;
                };

                return {
                    parcelId: getTextById('ContentPlaceHolder1_lblPIN'),
                    address: getTextById('ContentPlaceHolder1_lblAddress'),
                    city: getTextById('ContentPlaceHolder1_lblCity'),
                    zip: getTextById('ContentPlaceHolder1_lblZip'),
                    legalDescription: getTextById('ContentPlaceHolder1_lblLegalDesc'),
                    sevValue: getTextById('ContentPlaceHolder1_lblSEV'),
                    auctionId: getTextById('ContentPlaceHolder1_lblAI_ID'),
                    status: getTextById('ContentPlaceHolder1_lblStatus'),
                    currentTime: getTextById('ContentPlaceHolder1_lblCurrentTime'),
                    timeRemaining: getTextById('ContentPlaceHolder1_lblTimeRemaining'),
                    biddingStarts: getTextById('ContentPlaceHolder1_lblAuctionStarts'),
                    biddingCloses: getTextById('ContentPlaceHolder1_lblAuctionCloses'),
                    currentBid: getTextById('ContentPlaceHolder1_lblCurrent_Bid'),
                    minimumBid: getTextById('ContentPlaceHolder1_lblMinBid'),
                    summerTax: getTextById('ContentPlaceHolder1_lblSummerTax'),
                    winterTax: getTextById('ContentPlaceHolder1_lblWinterTax'),
                    totalTax: getTextById('ContentPlaceHolder1_lblTotalTax'),
                    bidCount: getTextById('ContentPlaceHolder1_lblBidCount'),

                    // Additional fields that might be present
                    propertyClass: getTextById('ContentPlaceHolder1_lblPropertyClass'),
                    ward: getTextById('ContentPlaceHolder1_lblWard'),
                    yearBuilt: getTextById('ContentPlaceHolder1_lblYearBuilt'),
                    squareFootage: getTextById('ContentPlaceHolder1_lblSquareFootage'),

                    // Meta information
                    scrapedAt: new Date().toISOString(),
                    pageUrl: window.location.href
                };
            });

            // Clean up currency values
            if (propertyData.currentBid) {
                propertyData.currentBidNumeric = this.parseCurrency(propertyData.currentBid);
            }
            if (propertyData.minimumBid) {
                propertyData.minimumBidNumeric = this.parseCurrency(propertyData.minimumBid);
            }
            if (propertyData.sevValue) {
                propertyData.sevValueNumeric = this.parseCurrency(propertyData.sevValue);
            }

            // Determine if property has bids
            propertyData.hasBids = propertyData.currentBid &&
                               propertyData.currentBid !== '' &&
                               propertyData.currentBid !== '$0.00';

            return propertyData;

        } catch (error) {
            console.error(`Error scraping property ${auctionId}:`, error);
            return null;
        }
    }

    async scrapePropertyRange(startId, endId, options = {}) {
        const results = [];
        const batchSize = options.batchSize || 10;
        const delayMs = options.delayMs || 1000;
        const onProgress = options.onProgress || (() => {});

        console.log(`Starting batch scrape from ${startId} to ${endId}`);

        let successCount = 0;
        let failCount = 0;

        for (let id = startId; id <= endId; id++) {
            try {
                const propertyData = await this.scrapePropertyById(id);

                if (propertyData) {
                    results.push(propertyData);
                    successCount++;
                    console.log(`✓ Scraped ${id}: ${propertyData.address || 'No address'}`);
                } else {
                    failCount++;
                    console.log(`✗ No data for ${id}`);
                }

                // Progress callback
                onProgress({
                    current: id,
                    total: endId - startId + 1,
                    successCount,
                    failCount,
                    currentProperty: propertyData
                });

                // Rate limiting
                if ((id - startId + 1) % batchSize === 0 && id < endId) {
                    console.log(`Batch complete. Waiting ${delayMs}ms...`);
                    await this.delay(delayMs);
                }

            } catch (error) {
                console.error(`Failed to scrape ${id}:`, error.message);
                failCount++;
            }
        }

        console.log(`Scraping complete. Success: ${successCount}, Failed: ${failCount}`);
        return results;
    }

    async searchByAddress(streetNumber, streetName) {
        try {
            const searchUrl = `${this.baseUrl}/Search.aspx`;
            await this.page.goto(searchUrl, { waitUntil: 'networkidle' });

            // Fill search form
            await this.page.fill('#ContentPlaceHolder1_txtStreetNbr', streetNumber);
            await this.page.fill('#ContentPlaceHolder1_txtStreetName', streetName);

            // Click search button
            await this.page.click('#ContentPlaceHolder1_btnViewAddressDtls');
            await this.page.waitForLoadState('networkidle');

            // Extract results
            const results = await this.page.evaluate(() => {
                const table = document.getElementById('ContentPlaceHolder1_grvProperty');
                if (!table) return [];

                const rows = table.querySelectorAll('tr');
                const data = [];

                // Skip header row
                for (let i = 1; i < rows.length; i++) {
                    const cells = rows[i].querySelectorAll('td');
                    if (cells.length > 0) {
                        data.push({
                            auctionId: cells[0]?.textContent?.trim(),
                            parcelId: cells[1]?.textContent?.trim(),
                            address: cells[2]?.textContent?.trim(),
                            city: cells[3]?.textContent?.trim(),
                            status: cells[4]?.textContent?.trim()
                        });
                    }
                }

                return data;
            });

            return results;

        } catch (error) {
            console.error('Search error:', error);
            return [];
        }
    }

    parseCurrency(value) {
        if (!value) return 0;
        return parseFloat(value.replace(/[$,]/g, '')) || 0;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('Browser closed');
        }
    }
}

module.exports = WayneCountyAuctionScraper;