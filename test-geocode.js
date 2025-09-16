const https = require('https');

// Test the Detroit geocoding API with a sample address
async function testGeocode() {
    const sampleAddress = '104 ENGLEWOOD, DETROIT, MI 48202';

    const params = new URLSearchParams({
        singleLine: sampleAddress,
        outFields: '*',
        f: 'json'
    });

    const url = `https://opengis.detroitmi.gov/opengis/rest/services/BaseUnits/BaseUnitGeocoder/GeocodeServer/findAddressCandidates?${params}`;

    console.log('Testing Detroit Geocoding API...');
    console.log('Address:', sampleAddress);
    console.log('URL:', url);
    console.log('-'.repeat(50));

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
                        console.log('✅ API Working! Found', result.candidates.length, 'candidate(s)');
                        console.log('\nTop match:');
                        const top = result.candidates[0];
                        console.log('  Address:', top.address);
                        console.log('  Score:', top.score);
                        console.log('  Location:');
                        console.log('    Longitude:', top.location.x);
                        console.log('    Latitude:', top.location.y);
                        console.log('  Attributes:', JSON.stringify(top.attributes, null, 2));
                    } else {
                        console.log('❌ No candidates found');
                        console.log('Response:', JSON.stringify(result, null, 2));
                    }

                    resolve(result);
                } catch (error) {
                    console.error('Error parsing response:', error);
                    console.log('Raw response:', data);
                    reject(error);
                }
            });
        }).on('error', (err) => {
            console.error('Request error:', err);
            reject(err);
        });
    });
}

// Run the test
testGeocode().catch(console.error);