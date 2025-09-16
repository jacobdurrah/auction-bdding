const fs = require('fs').promises;
const path = require('path');

class AnalyticsEngine {
    constructor() {
        this.dataDir = path.join(__dirname, 'data');
        this.propertiesFile = path.join(this.dataDir, 'properties.json');
        this.zillowFile = path.join(this.dataDir, 'zillow-data.json');
        this.bidHistoryFile = path.join(this.dataDir, 'bid-history', 'bid-history.json');
        this.properties = [];
        this.zillowData = {};
        this.bidHistory = {};
        this.mergedData = [];
    }

    async loadData() {
        try {
            // Load auction properties
            const propertiesJson = await fs.readFile(this.propertiesFile, 'utf8');
            let allProperties = JSON.parse(propertiesJson);

            // Filter out bundle properties (those without closing times)
            this.properties = allProperties.filter(p =>
                p.biddingCloses && p.biddingCloses !== 'N/A'
            );

            // Load Zillow data
            const zillowJson = await fs.readFile(this.zillowFile, 'utf8');
            this.zillowData = JSON.parse(zillowJson);

            // Load bid history if available
            try {
                const bidHistoryJson = await fs.readFile(this.bidHistoryFile, 'utf8');
                this.bidHistory = JSON.parse(bidHistoryJson);
                console.log(`Loaded bid history for ${Object.keys(this.bidHistory).length} properties`);
            } catch (error) {
                // Bid history might not exist yet
                this.bidHistory = {};
            }

            console.log(`Loaded ${this.properties.length} properties and ${Object.keys(this.zillowData).length} Zillow records`);
        } catch (error) {
            console.error('Error loading data:', error);
            throw error;
        }
    }

    // Create address key for matching
    getAddressKey(address, city = 'DETROIT', state = 'MI', zip = '') {
        if (!address) return null;
        return `${address}_${city}_${state}_${zip}`
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_');
    }

    // Merge auction, Zillow, and bid history data
    mergeData() {
        this.mergedData = this.properties.map(property => {
            const addressKey = this.getAddressKey(property.address, property.city, 'MI', property.zip);
            const zillow = addressKey ? this.zillowData[addressKey] : null;
            const bidHistory = this.bidHistory[property.auctionId] || null;

            return {
                ...property,
                zillow: zillow && !zillow.notFound ? zillow : null,
                bidHistory: bidHistory,
                addressKey
            };
        });

        const withZillow = this.mergedData.filter(p => p.zillow).length;
        const withBidHistory = this.mergedData.filter(p => p.bidHistory).length;
        console.log(`Merged data: ${withZillow}/${this.mergedData.length} with Zillow, ${withBidHistory} with bid history`);
    }

    // Calculate profit potential score
    calculateProfitScore(property) {
        if (!property.zillow || !property.minimumBidNumeric) return 0;

        const minBid = property.minimumBidNumeric;
        const zestimate = property.zillow.zestimate || 0;
        const rentEstimate = property.zillow.rentZestimate || 0;
        const sev = property.sevValueNumeric || 0;

        // ROI calculation (weighted 40%)
        const roi = zestimate > 0 ? ((zestimate - minBid) / minBid) * 100 : 0;
        const roiScore = Math.min(roi / 2, 100); // Cap at 100

        // Annual rent yield (weighted 30%)
        const annualRent = rentEstimate * 12;
        const rentYield = minBid > 0 ? (annualRent / minBid) * 100 : 0;
        const rentScore = Math.min(rentYield * 5, 100); // Cap at 100

        // SEV discount (weighted 20%)
        const sevDiscount = sev > 0 ? ((sev - minBid) / sev) * 100 : 0;
        const sevScore = Math.min(sevDiscount * 2, 100);

        // Market value gap (weighted 10%)
        const marketGap = (zestimate && sev) ? (zestimate / sev) : 1;
        const gapScore = Math.min((marketGap - 1) * 50, 100);

        // Weighted average
        const score = (roiScore * 0.4) + (rentScore * 0.3) + (sevScore * 0.2) + (gapScore * 0.1);

        return {
            total: Math.round(score),
            roi: Math.round(roi),
            rentYield: Math.round(rentYield),
            sevDiscount: Math.round(sevDiscount),
            marketGap: Math.round((marketGap - 1) * 100),
            components: {
                roiScore: Math.round(roiScore),
                rentScore: Math.round(rentScore),
                sevScore: Math.round(sevScore),
                gapScore: Math.round(gapScore)
            }
        };
    }

    // Predict competition level with bid history integration
    predictCompetition(property) {
        let competitionScore = 0;
        const factors = [];

        // Integrate bid history if available
        if (property.bidHistory && property.bidHistory.metrics) {
            const historyMetrics = property.bidHistory.metrics;

            // Use actual competition score from bid history (weighted 50% if available)
            if (historyMetrics.competitionScore) {
                competitionScore += historyMetrics.competitionScore * 0.5;
                factors.push(`Historical competition score: ${historyMetrics.competitionScore}`);
            }

            // Factor in bid velocity
            if (historyMetrics.bidVelocity >= 3) {
                competitionScore += 20;
                factors.push('Very high bid velocity (3+ changes/day)');
            } else if (historyMetrics.bidVelocity >= 1) {
                competitionScore += 10;
                factors.push('High bid velocity (1+ changes/day)');
            }

            // Recent activity
            if (historyMetrics.lastChangeHours !== null && historyMetrics.lastChangeHours <= 6) {
                competitionScore += 15;
                factors.push('Very recent bid activity');
            }

            // Total bid changes
            if (historyMetrics.totalChanges >= 5) {
                competitionScore += 15;
                factors.push(`${historyMetrics.totalChanges} bid changes recorded`);
            }
        }

        // SEV to minimum bid ratio (higher = more competition)
        const sevRatio = property.sevValueNumeric / property.minimumBidNumeric;
        if (sevRatio > 50) {
            competitionScore += 15;
            factors.push('Very high SEV/bid ratio');
        } else if (sevRatio > 20) {
            competitionScore += 10;
            factors.push('High SEV/bid ratio');
        } else if (sevRatio > 10) {
            competitionScore += 5;
            factors.push('Moderate SEV/bid ratio');
        }

        // Round number minimum bids attract more attention
        const minBid = property.minimumBidNumeric;
        if (minBid % 1000 === 0) {
            competitionScore += 10;
            factors.push('Round bid amount');
        } else if (minBid % 500 === 0) {
            competitionScore += 5;
            factors.push('Semi-round bid amount');
        }

        // Low absolute minimum bid
        if (minBid <= 500) {
            competitionScore += 15;
            factors.push('Very low entry price');
        } else if (minBid <= 1000) {
            competitionScore += 10;
            factors.push('Low entry price');
        }

        // Good Zillow metrics
        if (property.zillow) {
            const zestimate = property.zillow.zestimate || 0;
            if (zestimate > minBid * 10) {
                competitionScore += 10;
                factors.push('Exceptional Zestimate/bid ratio');
            } else if (zestimate > minBid * 5) {
                competitionScore += 5;
                factors.push('High Zestimate/bid ratio');
            }

            // Good school ratings
            const schools = property.zillow.schools || [];
            const avgRating = schools.length > 0
                ? schools.reduce((sum, s) => sum + (s.rating || 0), 0) / schools.length
                : 0;
            if (avgRating >= 7) {
                competitionScore += 10;
                factors.push('Good school district');
            }
        }

        // Already has bids
        if (property.hasBids) {
            competitionScore += 10;
            factors.push('Already has bids');
        }

        // Closing time (earlier slots may have less competition)
        const closingHour = new Date(property.biddingCloses).getHours();
        if (closingHour >= 14) { // After 2 PM
            competitionScore += 5;
            factors.push('Prime closing time');
        }

        return {
            score: Math.min(competitionScore, 100),
            factors,
            level: competitionScore >= 70 ? 'HIGH' :
                   competitionScore >= 40 ? 'MEDIUM' : 'LOW',
            bidHistory: property.bidHistory?.metrics || null
        };
    }

    // Find hidden gems
    findHiddenGems(property) {
        const gems = [];
        let gemScore = 0;

        // Properties where Zillow value >> SEV (assessment lag)
        if (property.zillow && property.sevValueNumeric) {
            const zestimate = property.zillow.zestimate || 0;
            const assessmentRatio = zestimate / property.sevValueNumeric;

            if (assessmentRatio > 3) {
                gemScore += 30;
                gems.push('Zestimate 3x+ higher than SEV');
            } else if (assessmentRatio > 2) {
                gemScore += 20;
                gems.push('Zestimate 2x higher than SEV');
            }
        }

        // High rent potential relative to price
        if (property.zillow && property.minimumBidNumeric) {
            const rentEstimate = property.zillow.rentZestimate || 0;
            const annualRent = rentEstimate * 12;
            const capRate = (annualRent / property.minimumBidNumeric) * 100;

            if (capRate > 20) {
                gemScore += 25;
                gems.push(`Exceptional ${capRate.toFixed(1)}% cap rate`);
            } else if (capRate > 15) {
                gemScore += 15;
                gems.push(`Strong ${capRate.toFixed(1)}% cap rate`);
            }
        }

        // No current bids despite good metrics
        if (!property.hasBids && property.zillow) {
            const profitScore = this.calculateProfitScore(property);
            if (profitScore.total > 60) {
                gemScore += 20;
                gems.push('Good value with no bids yet');
            }
        }

        // Odd bid amounts (less psychological appeal)
        const minBid = property.minimumBidNumeric;
        if (minBid % 100 !== 0 && minBid > 500) {
            gemScore += 10;
            gems.push('Non-round bid amount (less attention)');
        }

        // Missing or incomplete address (harder to research)
        if (!property.zillow && property.address) {
            gemScore += 15;
            gems.push('Limited online data (less competition)');
        }

        return {
            score: Math.min(gemScore, 100),
            factors: gems,
            isGem: gemScore >= 40
        };
    }

    // Calculate overall strategy score
    calculateStrategyScore(property) {
        const profit = this.calculateProfitScore(property);
        const competition = this.predictCompetition(property);
        const gem = this.findHiddenGems(property);

        // Strategy score weights:
        // - Profit potential: 40%
        // - Low competition: 35%
        // - Hidden gem factors: 25%
        const strategyScore = (profit.total * 0.4) +
                            ((100 - competition.score) * 0.35) +
                            (gem.score * 0.25);

        return {
            total: Math.round(strategyScore),
            profit,
            competition,
            gem,
            recommendation: this.getRecommendation(strategyScore, competition.level)
        };
    }

    getRecommendation(score, competitionLevel) {
        if (score >= 80) {
            return competitionLevel === 'LOW' ? 'STRONG BUY - Excellent opportunity' : 'GOOD BUY - Monitor competition';
        } else if (score >= 60) {
            return competitionLevel === 'LOW' ? 'GOOD BUY - Solid opportunity' : 'CONSIDER - Watch for better options';
        } else if (score >= 40) {
            return 'MAYBE - Only if no better options';
        } else {
            return 'SKIP - Look for better opportunities';
        }
    }

    // Analyze all properties
    analyzeAll() {
        const analyzed = this.mergedData.map(property => {
            const strategy = this.calculateStrategyScore(property);

            return {
                ...property,
                analytics: {
                    strategy,
                    profitPotential: strategy.profit.total,
                    competitionLevel: strategy.competition.level,
                    isHiddenGem: strategy.gem.isGem,
                    overallScore: strategy.total,
                    recommendation: strategy.recommendation
                }
            };
        });

        // Sort by overall strategy score
        analyzed.sort((a, b) => b.analytics.overallScore - a.analytics.overallScore);

        return analyzed;
    }

    // Get top recommendations for a budget
    getRecommendations(budget, count = 10) {
        const eligible = this.analyzeAll()
            .filter(p => p.minimumBidNumeric <= budget);

        const recommendations = {
            bestValue: eligible.slice(0, count),
            lowestCompetition: [...eligible]
                .sort((a, b) => a.analytics.strategy.competition.score - b.analytics.strategy.competition.score)
                .slice(0, count),
            hiddenGems: eligible
                .filter(p => p.analytics.isHiddenGem)
                .slice(0, count),
            byClosingTime: this.groupByClosingTime(eligible)
        };

        return recommendations;
    }

    // Group properties by closing time
    groupByClosingTime(properties) {
        const groups = {};

        properties.forEach(property => {
            const closing = property.biddingCloses;
            if (!groups[closing]) {
                groups[closing] = [];
            }
            groups[closing].push(property);
        });

        // Sort each group by score
        Object.keys(groups).forEach(time => {
            groups[time].sort((a, b) => b.analytics.overallScore - a.analytics.overallScore);
        });

        return groups;
    }

    // Export analysis results
    async exportAnalysis(filename = 'auction-analysis.json') {
        const analysis = {
            metadata: {
                generatedAt: new Date().toISOString(),
                totalProperties: this.mergedData.length,
                propertiesWithZillow: this.mergedData.filter(p => p.zillow).length
            },
            properties: this.analyzeAll(),
            recommendations: this.getRecommendations(10000), // $10k budget example
            summary: this.generateSummary()
        };

        const outputPath = path.join(this.dataDir, filename);
        await fs.writeFile(outputPath, JSON.stringify(analysis, null, 2));
        console.log(`Analysis exported to ${outputPath}`);

        return analysis;
    }

    // Generate summary statistics
    generateSummary() {
        const analyzed = this.analyzeAll();
        const withZillow = analyzed.filter(p => p.zillow);

        return {
            total: analyzed.length,
            withZillowData: withZillow.length,
            averageMinBid: Math.round(analyzed.reduce((sum, p) => sum + p.minimumBidNumeric, 0) / analyzed.length),
            averageSEV: Math.round(analyzed.reduce((sum, p) => sum + p.sevValueNumeric, 0) / analyzed.length),
            propertiesWithBids: analyzed.filter(p => p.hasBids).length,
            hiddenGems: analyzed.filter(p => p.analytics.isHiddenGem).length,
            highCompetition: analyzed.filter(p => p.analytics.competitionLevel === 'HIGH').length,
            strongBuys: analyzed.filter(p => p.analytics.recommendation.includes('STRONG BUY')).length
        };
    }
}

// Export for use in other modules
module.exports = AnalyticsEngine;

// Direct execution
if (require.main === module) {
    async function runAnalysis() {
        const engine = new AnalyticsEngine();

        try {
            await engine.loadData();
            engine.mergeData();

            const analysis = await engine.exportAnalysis();

            console.log('\n📊 Analysis Complete!');
            console.log('Summary:', analysis.summary);
            console.log('\nTop 5 Recommendations:');

            analysis.recommendations.bestValue.slice(0, 5).forEach((prop, i) => {
                console.log(`\n${i + 1}. ${prop.address}, ${prop.city}`);
                console.log(`   Min Bid: $${prop.minimumBidNumeric.toLocaleString()}`);
                console.log(`   Score: ${prop.analytics.overallScore}/100`);
                console.log(`   ${prop.analytics.recommendation}`);
            });

        } catch (error) {
            console.error('Error running analysis:', error);
        }
    }

    runAnalysis();
}