#!/bin/bash

# Script to update auction data and push to GitHub
# This will trigger an automatic Vercel deployment

echo "🏠 Wayne County Auction Data Updater"
echo "===================================="
echo ""

# Check if git is initialized
if [ ! -d .git ]; then
    echo "❌ Error: Not a git repository"
    echo "Please run this script from the project root"
    exit 1
fi

# Check if data file exists
if [ -f "data/properties.json" ]; then
    echo "✅ Found existing data file"

    # Get file size and last modified
    FILE_SIZE=$(ls -lh data/properties.json | awk '{print $5}')
    FILE_DATE=$(date -r data/properties.json "+%Y-%m-%d %H:%M:%S")

    echo "   Size: $FILE_SIZE"
    echo "   Last updated: $FILE_DATE"
    echo ""
else
    echo "⚠️  No existing data file found"
    echo "   Please run the scraper first at http://localhost:3000"
    echo ""
fi

# Prompt for confirmation
read -p "Do you want to push the current data to GitHub? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "📤 Pushing data to GitHub..."

    # Stage the data file
    git add data/properties.json

    # Check if there are changes
    if git diff --staged --quiet; then
        echo "ℹ️  No changes to commit"
        exit 0
    fi

    # Create commit with timestamp
    TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
    PROPERTY_COUNT=$(grep -o '"auctionId"' data/properties.json 2>/dev/null | wc -l | tr -d ' ')

    git commit -m "Update auction data - $TIMESTAMP" -m "Properties: $PROPERTY_COUNT"

    # Push to GitHub
    git push origin main

    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Success! Data pushed to GitHub"
        echo ""
        echo "🚀 Vercel will automatically deploy the update"
        echo "   Check deployment status at: https://vercel.com/jacob-durrahs-projects/wayne-auction"
        echo ""
        echo "📊 Live site will update in ~1-2 minutes at:"
        echo "   https://wayne-auction-5ywun7d0h-jacob-durrahs-projects.vercel.app"
    else
        echo ""
        echo "❌ Error pushing to GitHub"
        echo "   Please check your internet connection and try again"
    fi
else
    echo ""
    echo "❌ Cancelled"
fi