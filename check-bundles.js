const fs = require('fs');
const data = JSON.parse(fs.readFileSync('data/properties.json'));
const withClosing = data.filter(p => p.biddingCloses && p.biddingCloses !== 'N/A');
const noClosing = data.filter(p => !p.biddingCloses || p.biddingCloses === 'N/A');

console.log('Total properties:', data.length);
console.log('With closing time:', withClosing.length);
console.log('Without closing time (bundles):', noClosing.length);

if (noClosing.length > 0) {
    console.log('\nSample bundle property:');
    console.log('Address:', noClosing[0].address);
    console.log('Status:', noClosing[0].status);
    console.log('Min Bid:', noClosing[0].minimumBid);
}
