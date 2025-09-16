const fs = require('fs').promises;
const path = require('path');

class ZillowFetcher {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://zillow-com1.p.rapidapi.com';
        this.headers = {
            'X-RapidAPI-Key': apiKey,
            'X-RapidAPI-Host': 'zillow-com1.p.rapidapi.com'
        };
        this.dataDir = path.join(__dirname, 'data');
        this.zillowDataFile = path.join(this.dataDir, 'zillow-data.json');
        this.zillowData = {};
        this.delay = 1100; // Rate limit: ~1 request per second
    }

    async initialize() {
        // Ensure data directory exists
        await fs.mkdir(this.dataDir, { recursive: true });

        // Load existing Zillow data if available
        try {
            const existingData = await fs.readFile(this.zillowDataFile, 'utf8');
            this.zillowData = JSON.parse(existingData);
            console.log(`Loaded ${Object.keys(this.zillowData).length} existing Zillow records`);
        } catch (error) {
            console.log('No existing Zillow data found, starting fresh');
            this.zillowData = {};
        }
    }

    // Create a unique key for each address
    getAddressKey(address, city, state = 'MI', zip = '') {
        // Normalize address for consistent matching
        const normalized = `${address}_${city}_${state}_${zip}`
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_');
        return normalized;
    }

    async fetchPropertyDetails(address, city, state = 'MI', zipcode = '') {
        const addressKey = this.getAddressKey(address, city, state, zipcode);

        // Check if we already have this data
        if (this.zillowData[addressKey]) {
            console.log(`✓ Already have Zillow data for: ${address}, ${city}`);
            return this.zillowData[addressKey];
        }

        try {
            console.log(`Fetching Zillow data for: ${address}, ${city}, ${state}`);

            // Construct the address query - format like the example
            const fullAddress = `${address} ${city} ${state}${zipcode ? ' ' + zipcode : ''}`.trim();
            const url = `${this.baseUrl}/property?address=${encodeURIComponent(fullAddress)}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: this.headers
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const data = await response.json();

            // The /property endpoint returns the property directly, not in a props array
            const property = data;

            if (property && property.zpid) {
                // Extract key information
                const zillowInfo = {
                    address: property.address || property.streetAddress,
                    addressKey: addressKey,
                    zpid: property.zpid,
                    price: property.price,
                    zestimate: property.zestimate,
                    rentZestimate: property.rentZestimate,
                    bedrooms: property.bedrooms,
                    bathrooms: property.bathrooms,
                    livingArea: property.livingArea,
                    livingAreaValue: property.livingAreaValue,
                    yearBuilt: property.yearBuilt,
                    lotSize: property.lotSize,
                    lotAreaValue: property.lotAreaValue,
                    lotAreaUnits: property.lotAreaUnits,
                    homeType: property.homeType,
                    homeStatus: property.homeStatus,
                    daysOnZillow: property.daysOnZillow,
                    taxAssessedValue: property.taxAssessedValue,
                    propertyTaxRate: property.propertyTaxRate,
                    taxHistory: Array.isArray(property.taxHistory) ? property.taxHistory.slice(0, 5) : property.taxHistory, // Last 5 years
                    priceHistory: Array.isArray(property.priceHistory) ? property.priceHistory.slice(0, 5) : property.priceHistory, // Last 5 price changes
                    imgSrc: property.imgSrc,
                    hdpUrl: property.hdpUrl,
                    streetView: property.miniCardPhotos?.[0]?.url,
                    // Climate risk data
                    climate: {
                        flood: property.climate?.floodSources?.primary?.riskScore,
                        fire: property.climate?.fireSources?.primary?.riskScore,
                        wind: property.climate?.windSources?.primary?.riskScore,
                        heat: property.climate?.heatSources?.primary?.riskScore,
                        air: property.climate?.airSources?.primary?.riskScore
                    },
                    schools: property.schools,
                    description: property.description,
                    fetchedAt: new Date().toISOString()
                };

                // Store the data
                this.zillowData[addressKey] = zillowInfo;

                // Save after each successful fetch
                await this.saveData();

                console.log(`✓ Fetched Zillow data for: ${address} - Zestimate: $${zillowInfo.zestimate?.toLocaleString() || 'N/A'}`);
                return zillowInfo;
            } else {
                console.log(`✗ No Zillow data found for: ${address}, ${city}`);
                // Store null to avoid re-fetching
                this.zillowData[addressKey] = {
                    addressKey,
                    notFound: true,
                    fetchedAt: new Date().toISOString()
                };
                await this.saveData();
                return null;
            }

        } catch (error) {
            console.error(`Error fetching Zillow data for ${address}:`, error.message);
            return null;
        }
    }

    async fetchAllProperties(properties) {
        console.log(`\n🏠 Fetching Zillow data for ${properties.length} properties\n`);

        const results = [];
        let successCount = 0;
        let skipCount = 0;
        let failCount = 0;

        for (let i = 0; i < properties.length; i++) {
            const property = properties[i];

            // Skip if no address
            if (!property.address) {
                console.log(`[${i + 1}/${properties.length}] Skipping - no address`);
                skipCount++;
                continue;
            }

            console.log(`[${i + 1}/${properties.length}] Processing: ${property.address}, ${property.city}`);

            const zillowData = await this.fetchPropertyDetails(
                property.address,
                property.city || 'DETROIT',
                'MI',
                property.zip || ''
            );

            if (zillowData) {
                if (!zillowData.notFound) {
                    successCount++;
                    results.push({
                        ...property,
                        zillowData
                    });
                } else {
                    failCount++;
                }
            } else {
                failCount++;
            }

            // Rate limiting delay (except for last item)
            if (i < properties.length - 1) {
                await new Promise(resolve => setTimeout(resolve, this.delay));
            }

            // Progress update every 10 properties
            if ((i + 1) % 10 === 0) {
                console.log(`\n📊 Progress: ${i + 1}/${properties.length} (Success: ${successCount}, Failed: ${failCount}, Skipped: ${skipCount})\n`);
            }
        }

        console.log(`\n✅ Zillow fetch complete!`);
        console.log(`   Success: ${successCount}`);
        console.log(`   Failed: ${failCount}`);
        console.log(`   Skipped: ${skipCount}`);
        console.log(`   Total Zillow records: ${Object.keys(this.zillowData).length}\n`);

        return results;
    }

    async saveData() {
        await fs.writeFile(this.zillowDataFile, JSON.stringify(this.zillowData, null, 2));
    }

    // Get Zillow data for a property by address
    getZillowData(address, city, state = 'MI', zip = '') {
        const addressKey = this.getAddressKey(address, city, state, zip);
        return this.zillowData[addressKey] || null;
    }

    // Get all Zillow data
    getAllZillowData() {
        return this.zillowData;
    }
}

// Direct execution
if (require.main === module) {
    async function runZillowFetch() {
        try {
            // Get API key from environment or use the one from the screenshots
            const apiKey = process.env.RAPIDAPI_KEY || '435eeaf287msh252959294ebf8abp1d39bbjsnc04db0da6d18';

            const fetcher = new ZillowFetcher(apiKey);
            await fetcher.initialize();

            // Load scraped properties
            const propertiesFile = path.join(__dirname, 'data', 'properties.json');
            const propertiesData = await fs.readFile(propertiesFile, 'utf8');
            const properties = JSON.parse(propertiesData);

            console.log(`Found ${properties.length} properties to process`);

            // Fetch Zillow data for all properties
            await fetcher.fetchAllProperties(properties);

            console.log('✨ All done! Zillow data saved to data/zillow-data.json');

        } catch (error) {
            console.error('Error:', error);
        }
    }

    runZillowFetch();
}

module.exports = ZillowFetcher;