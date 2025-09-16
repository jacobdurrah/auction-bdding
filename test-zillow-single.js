const ZillowFetcher = require('./zillow-fetcher');

async function testSingle() {
    const apiKey = process.env.RAPIDAPI_KEY || '435eeaf287msh252959294ebf8abp1d39bbjsnc04db0da6d18';
    const fetcher = new ZillowFetcher(apiKey);
    await fetcher.initialize();

    // Test with a single property
    const result = await fetcher.fetchPropertyDetails(
        '104 ENGLEWOOD',
        'DETROIT',
        'MI',
        '48202'
    );

    console.log('\nResult:', JSON.stringify(result, null, 2));
}

testSingle();