const fs = require('fs').promises;
const https = require('https');
const path = require('path');

class PropertyGeocoder {
    constructor() {
        this.dataDir = path.join(__dirname, 'data');
        this.propertiesFile = path.join(this.dataDir, 'properties.json');
        this.zillowFile = path.join(this.dataDir, 'zillow-data.json');
        this.geocodeCache = {};
        this.requestDelay = 100; // 100ms between requests to be respectful
        this.maxConcurrent = 5; // Process 5 addresses at once
    }

    // Create address key for matching
    getAddressKey(address, city = 'DETROIT', state = 'MI', zip = '') {
        if (!address) return null;
        return `${address}_${city}_${state}_${zip}`
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_');
    }

    // Geocode a single address
    async geocodeAddress(address, city = 'DETROIT', state = 'MI', zip = '') {
        const fullAddress = zip ?
            `${address}, ${city}, ${state} ${zip}` :
            `${address}, ${city}, ${state}`;

        const params = new URLSearchParams({
            singleLine: fullAddress,
            outFields: '*',
            f: 'json'
        });

        const url = `https://opengis.detroitmi.gov/opengis/rest/services/BaseUnits/BaseUnitGeocoder/GeocodeServer/findAddressCandidates?${params}`;

        return new Promise((resolve, reject) => {
            https.get(url, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);

                        if (result.candidates && result.candidates.length > 0) {
                            const top = result.candidates[0];
                            // Only accept high-confidence matches
                            if (top.score >= 80) {
                                resolve({
                                    success: true,
                                    latitude: top.location.y,
                                    longitude: top.location.x,
                                    score: top.score,
                                    matchedAddress: top.address,
                                    parcelId: top.attributes?.parcel_id || null,
                                    buildingId: top.attributes?.building_id || null,
                                    addressId: top.attributes?.address_id || null,
                                    neighborhood: top.attributes?.neighborhood_name || null,
                                    councilDistrict: top.attributes?.council_district || null
                                });
                            } else {
                                resolve({
                                    success: false,
                                    reason: 'Low confidence score',
                                    score: top.score
                                });
                            }
                        } else {
                            resolve({
                                success: false,
                                reason: 'No candidates found'
                            });
                        }
                    } catch (error) {
                        resolve({
                            success: false,
                            reason: 'Parse error',
                            error: error.message
                        });
                    }
                });
            }).on('error', (err) => {
                resolve({
                    success: false,
                    reason: 'Request error',
                    error: err.message
                });
            });
        });
    }

    // Process properties in batches
    async processBatch(properties, startIdx, batchSize) {
        const batch = properties.slice(startIdx, startIdx + batchSize);
        const results = [];

        for (const property of batch) {
            const result = await this.geocodeAddress(
                property.address,
                property.city || 'DETROIT',
                'MI',
                property.zip || ''
            );

            results.push({
                auctionId: property.auctionId,
                address: property.address,
                addressKey: this.getAddressKey(property.address, property.city, 'MI', property.zip),
                geocode: result
            });

            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, this.requestDelay));
        }

        return results;
    }

    async geocodeAllProperties() {
        console.log('🌍 Starting property geocoding...\n');

        try {
            // Load properties
            const propertiesData = await fs.readFile(this.propertiesFile, 'utf8');
            const properties = JSON.parse(propertiesData);

            // Filter out bundles (no closing time)
            const validProperties = properties.filter(p =>
                p.biddingCloses && p.biddingCloses !== 'N/A' && p.address
            );

            console.log(`📍 Processing ${validProperties.length} properties`);

            // Load existing zillow data
            let zillowData = {};
            try {
                const zillowJson = await fs.readFile(this.zillowFile, 'utf8');
                zillowData = JSON.parse(zillowJson);
            } catch (error) {
                console.log('No existing zillow data file, creating new one');
            }

            // Process in batches
            const results = [];
            const batchSize = this.maxConcurrent;
            let successful = 0;
            let failed = 0;

            for (let i = 0; i < validProperties.length; i += batchSize) {
                const progress = Math.min(i + batchSize, validProperties.length);
                console.log(`Processing ${i + 1}-${progress} of ${validProperties.length}...`);

                const batchResults = await this.processBatch(validProperties, i, batchSize);

                for (const result of batchResults) {
                    if (result.geocode.success) {
                        successful++;

                        // Add geocode data to zillow data
                        if (result.addressKey) {
                            if (!zillowData[result.addressKey]) {
                                zillowData[result.addressKey] = {};
                            }

                            zillowData[result.addressKey].geocode = {
                                latitude: result.geocode.latitude,
                                longitude: result.geocode.longitude,
                                score: result.geocode.score,
                                matchedAddress: result.geocode.matchedAddress,
                                parcelId: result.geocode.parcelId,
                                neighborhood: result.geocode.neighborhood,
                                councilDistrict: result.geocode.councilDistrict,
                                updatedAt: new Date().toISOString()
                            };
                        }
                    } else {
                        failed++;
                        console.log(`  ⚠️ Failed: ${result.address} - ${result.geocode.reason}`);
                    }
                }

                results.push(...batchResults);

                // Save progress periodically
                if (i % 50 === 0 || i + batchSize >= validProperties.length) {
                    await fs.writeFile(this.zillowFile, JSON.stringify(zillowData, null, 2));
                    console.log(`  💾 Saved progress: ${successful} geocoded, ${failed} failed`);
                }
            }

            // Final save
            await fs.writeFile(this.zillowFile, JSON.stringify(zillowData, null, 2));

            // Generate summary
            console.log('\n' + '='.repeat(50));
            console.log('📊 GEOCODING COMPLETE');
            console.log('='.repeat(50));
            console.log(`✅ Successfully geocoded: ${successful} properties`);
            console.log(`❌ Failed to geocode: ${failed} properties`);
            console.log(`📁 Data saved to: ${this.zillowFile}`);

            // Save geocoding results summary
            const summaryFile = path.join(this.dataDir, 'geocode-summary.json');
            await fs.writeFile(summaryFile, JSON.stringify({
                timestamp: new Date().toISOString(),
                totalProcessed: validProperties.length,
                successful,
                failed,
                successRate: ((successful / validProperties.length) * 100).toFixed(2) + '%',
                results: results.map(r => ({
                    auctionId: r.auctionId,
                    address: r.address,
                    success: r.geocode.success,
                    coordinates: r.geocode.success ? {
                        lat: r.geocode.latitude,
                        lng: r.geocode.longitude
                    } : null
                }))
            }, null, 2));

            console.log(`📄 Summary saved to: ${summaryFile}`);

            return {
                successful,
                failed,
                total: validProperties.length
            };

        } catch (error) {
            console.error('Error during geocoding:', error);
            throw error;
        }
    }
}

// Export for use in other modules
module.exports = PropertyGeocoder;

// Direct execution
if (require.main === module) {
    const geocoder = new PropertyGeocoder();

    // Check for test mode
    const args = process.argv.slice(2);
    if (args[0] === 'test') {
        // Test with a few properties
        geocoder.requestDelay = 500; // Slower for testing
        console.log('🧪 Running in test mode (first 10 properties)...\n');

        async function testMode() {
            const propertiesData = await fs.readFile(geocoder.propertiesFile, 'utf8');
            const properties = JSON.parse(propertiesData);
            const testProps = properties.filter(p => p.address).slice(0, 10);

            for (const prop of testProps) {
                console.log(`Testing: ${prop.address}, ${prop.city || 'DETROIT'}`);
                const result = await geocoder.geocodeAddress(prop.address, prop.city, 'MI', prop.zip);
                if (result.success) {
                    console.log(`  ✅ Lat: ${result.latitude.toFixed(6)}, Lng: ${result.longitude.toFixed(6)}`);
                } else {
                    console.log(`  ❌ ${result.reason}`);
                }
            }
        }

        testMode().catch(console.error);
    } else {
        // Full geocoding
        geocoder.geocodeAllProperties().catch(console.error);
    }
}