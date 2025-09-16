const fs = require('fs').promises;
const path = require('path');
const AnalyticsEngine = require('./analytics-engine');

class DataAggregator {
    constructor() {
        this.dataDir = path.join(__dirname, 'data');
        this.cacheFile = path.join(this.dataDir, 'aggregated-cache.json');
        this.analysisFile = path.join(this.dataDir, 'auction-analysis.json');
        this.engine = new AnalyticsEngine();
        this.cache = null;
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
        this.lastUpdate = null;
    }

    async initialize() {
        await this.engine.loadData();
        this.engine.mergeData();
        await this.loadCache();
    }

    async loadCache() {
        try {
            const cacheData = await fs.readFile(this.cacheFile, 'utf8');
            const cached = JSON.parse(cacheData);

            // Check if cache is still valid
            const cacheAge = Date.now() - new Date(cached.timestamp).getTime();
            if (cacheAge < this.cacheTimeout) {
                this.cache = cached;
                this.lastUpdate = cached.timestamp;
                console.log('Loaded valid cache from', new Date(cached.timestamp).toLocaleString());
                return true;
            }
        } catch (error) {
            // Cache doesn't exist or is invalid
        }

        // Generate fresh data
        await this.refreshCache();
        return false;
    }

    async refreshCache() {
        console.log('Generating fresh analysis...');

        // Run full analysis
        let analyzed = this.engine.analyzeAll();

        // Filter out bundle properties (those without closing times)
        analyzed = analyzed.filter(p =>
            p.biddingCloses && p.biddingCloses !== 'N/A'
        );

        // Group data for different views
        const cache = {
            timestamp: new Date().toISOString(),
            summary: this.engine.generateSummary(),

            // All properties with analytics
            properties: analyzed,

            // Top performers
            topByScore: analyzed.slice(0, 100),

            // Group by different criteria
            byClosingTime: this.groupByClosingTime(analyzed),
            byCompetition: this.groupByCompetition(analyzed),
            byPriceRange: this.groupByPriceRange(analyzed),

            // Special categories
            hiddenGems: analyzed.filter(p => p.analytics.isHiddenGem).slice(0, 50),
            noBidsYet: analyzed.filter(p => !p.hasBids).slice(0, 50),
            highROI: analyzed.filter(p => p.zillow && p.analytics.strategy.profit.roi > 100).slice(0, 50),

            // Statistics
            stats: this.calculateStatistics(analyzed)
        };

        this.cache = cache;
        this.lastUpdate = cache.timestamp;

        // Save to disk
        await fs.writeFile(this.cacheFile, JSON.stringify(cache, null, 2));
        console.log('Cache refreshed and saved');
    }

    groupByClosingTime(properties) {
        const groups = {};

        properties.forEach(property => {
            const closing = property.biddingCloses;
            if (!groups[closing]) {
                groups[closing] = {
                    time: closing,
                    count: 0,
                    properties: [],
                    averageScore: 0,
                    highCompetition: 0,
                    hiddenGems: 0
                };
            }

            const group = groups[closing];
            group.count++;
            group.properties.push({
                auctionId: property.auctionId,
                address: property.address,
                minimumBid: property.minimumBidNumeric,
                score: property.analytics.overallScore,
                competition: property.analytics.competitionLevel,
                recommendation: property.analytics.recommendation
            });

            if (property.analytics.competitionLevel === 'HIGH') group.highCompetition++;
            if (property.analytics.isHiddenGem) group.hiddenGems++;
        });

        // Calculate averages and sort properties within each group
        Object.values(groups).forEach(group => {
            group.averageScore = Math.round(
                group.properties.reduce((sum, p) => sum + p.score, 0) / group.count
            );
            group.properties.sort((a, b) => b.score - a.score);
            // Keep only top 10 per time slot for display
            group.properties = group.properties.slice(0, 10);
        });

        // Convert to sorted array
        return Object.values(groups).sort((a, b) =>
            new Date(a.time).getTime() - new Date(b.time).getTime()
        );
    }

    groupByCompetition(properties) {
        return {
            low: properties.filter(p => p.analytics.competitionLevel === 'LOW')
                          .slice(0, 50),
            medium: properties.filter(p => p.analytics.competitionLevel === 'MEDIUM')
                            .slice(0, 50),
            high: properties.filter(p => p.analytics.competitionLevel === 'HIGH')
                           .slice(0, 50)
        };
    }

    groupByPriceRange(properties) {
        const ranges = {
            under1k: { min: 0, max: 1000, properties: [] },
            '1k-5k': { min: 1000, max: 5000, properties: [] },
            '5k-10k': { min: 5000, max: 10000, properties: [] },
            '10k-25k': { min: 10000, max: 25000, properties: [] },
            '25k-50k': { min: 25000, max: 50000, properties: [] },
            over50k: { min: 50000, max: Infinity, properties: [] }
        };

        properties.forEach(property => {
            const price = property.minimumBidNumeric;

            for (const [key, range] of Object.entries(ranges)) {
                if (price >= range.min && price < range.max) {
                    range.properties.push(property);
                    break;
                }
            }
        });

        // Keep top 20 per range and add statistics
        Object.entries(ranges).forEach(([key, range]) => {
            range.properties = range.properties
                .sort((a, b) => b.analytics.overallScore - a.analytics.overallScore)
                .slice(0, 20);

            range.count = range.properties.length;
            range.averageScore = range.properties.length > 0
                ? Math.round(range.properties.reduce((sum, p) => sum + p.analytics.overallScore, 0) / range.properties.length)
                : 0;
        });

        return ranges;
    }

    calculateStatistics(properties) {
        const withZillow = properties.filter(p => p.zillow);
        const profitable = withZillow.filter(p =>
            p.zillow.zestimate && p.zillow.zestimate > p.minimumBidNumeric
        );

        return {
            total: properties.length,
            withZillow: withZillow.length,
            withBids: properties.filter(p => p.hasBids).length,

            priceStats: {
                avgMinBid: Math.round(
                    properties.reduce((sum, p) => sum + p.minimumBidNumeric, 0) / properties.length
                ),
                medianMinBid: this.calculateMedian(properties.map(p => p.minimumBidNumeric)),
                avgSEV: Math.round(
                    properties.reduce((sum, p) => sum + p.sevValueNumeric, 0) / properties.length
                )
            },

            profitability: {
                profitable: profitable.length,
                avgROI: profitable.length > 0
                    ? Math.round(profitable.reduce((sum, p) => sum + p.analytics.strategy.profit.roi, 0) / profitable.length)
                    : 0,
                over100PercentROI: profitable.filter(p => p.analytics.strategy.profit.roi > 100).length,
                over200PercentROI: profitable.filter(p => p.analytics.strategy.profit.roi > 200).length
            },

            competition: {
                low: properties.filter(p => p.analytics.competitionLevel === 'LOW').length,
                medium: properties.filter(p => p.analytics.competitionLevel === 'MEDIUM').length,
                high: properties.filter(p => p.analytics.competitionLevel === 'HIGH').length
            },

            recommendations: {
                strongBuy: properties.filter(p => p.analytics.recommendation.includes('STRONG BUY')).length,
                goodBuy: properties.filter(p => p.analytics.recommendation.includes('GOOD BUY')).length,
                consider: properties.filter(p => p.analytics.recommendation.includes('CONSIDER')).length,
                skip: properties.filter(p => p.analytics.recommendation.includes('SKIP')).length
            }
        };
    }

    calculateMedian(values) {
        const sorted = values.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
    }

    // Get recommendations for a specific budget
    async getRecommendations(budget) {
        if (!this.cache || this.isCacheExpired()) {
            await this.refreshCache();
        }

        const eligible = this.cache.properties.filter(p => p.minimumBidNumeric <= budget);

        return {
            budget,
            count: eligible.length,
            top10: eligible.slice(0, 10),
            lowestCompetition: eligible
                .sort((a, b) => a.analytics.strategy.competition.score - b.analytics.strategy.competition.score)
                .slice(0, 10),
            hiddenGems: eligible.filter(p => p.analytics.isHiddenGem).slice(0, 10),
            bestROI: eligible
                .filter(p => p.zillow)
                .sort((a, b) => b.analytics.strategy.profit.roi - a.analytics.strategy.profit.roi)
                .slice(0, 10)
        };
    }

    // Get properties closing soon
    async getClosingSoon(hoursAhead = 24) {
        if (!this.cache || this.isCacheExpired()) {
            await this.refreshCache();
        }

        const now = new Date();
        const cutoff = new Date(now.getTime() + (hoursAhead * 60 * 60 * 1000));

        const closingSoon = this.cache.properties.filter(property => {
            const closingTime = new Date(property.biddingCloses);
            return closingTime >= now && closingTime <= cutoff;
        });

        return {
            timeWindow: `${hoursAhead} hours`,
            count: closingSoon.length,
            properties: closingSoon
                .sort((a, b) => new Date(a.biddingCloses) - new Date(b.biddingCloses))
                .slice(0, 50)
        };
    }

    // Check if cache is expired
    isCacheExpired() {
        if (!this.lastUpdate) return true;
        const age = Date.now() - new Date(this.lastUpdate).getTime();
        return age > this.cacheTimeout;
    }

    // Get full cache data
    async getAllData() {
        if (!this.cache || this.isCacheExpired()) {
            await this.refreshCache();
        }
        return this.cache;
    }

    // Get summary only
    async getSummary() {
        if (!this.cache || this.isCacheExpired()) {
            await this.refreshCache();
        }
        return {
            summary: this.cache.summary,
            stats: this.cache.stats,
            lastUpdate: this.lastUpdate,
            cacheExpiry: new Date(new Date(this.lastUpdate).getTime() + this.cacheTimeout).toISOString()
        };
    }
}

// Export for use in server
module.exports = DataAggregator;

// Direct execution for testing
if (require.main === module) {
    async function test() {
        const aggregator = new DataAggregator();

        try {
            await aggregator.initialize();

            console.log('\n📊 Data Aggregator Test');

            // Get summary
            const summary = await aggregator.getSummary();
            console.log('\nSummary:', summary.summary);

            // Get recommendations for $10k budget
            const recommendations = await aggregator.getRecommendations(10000);
            console.log(`\nRecommendations for $10,000 budget:`);
            console.log(`- ${recommendations.count} eligible properties`);
            console.log(`- Top recommendation: ${recommendations.top10[0]?.address || 'None'}`);

            // Get properties closing soon
            const closingSoon = await aggregator.getClosingSoon(24);
            console.log(`\nProperties closing in next 24 hours: ${closingSoon.count}`);

        } catch (error) {
            console.error('Error:', error);
        }
    }

    test();
}