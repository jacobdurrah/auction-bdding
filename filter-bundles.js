const fs = require('fs');
const path = require('path');

// Load current data
const dataDir = path.join(__dirname, 'data');
const data = JSON.parse(fs.readFileSync(path.join(dataDir, 'properties.json')));

// Filter out bundles
const individual = data.filter(p => p.biddingCloses && p.biddingCloses !== 'N/A');
const bundles = data.filter(p => !p.biddingCloses || p.biddingCloses === 'N/A');

// Overwrite properties.json with only individual properties
fs.writeFileSync(path.join(dataDir, 'properties.json'), JSON.stringify(individual, null, 2));

// Save bundles separately
if (bundles.length > 0) {
    fs.writeFileSync(path.join(dataDir, 'bundle-properties.json'), JSON.stringify(bundles, null, 2));
}

console.log('✅ Filtered bundle properties:');
console.log(`   Individual properties: ${individual.length} (saved to properties.json)`);
console.log(`   Bundle properties: ${bundles.length} (saved to bundle-properties.json)`);
console.log('\nYour properties.json now contains only individual properties you can bid on!');