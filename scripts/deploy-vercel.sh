#!/bin/bash

# IcarusFlow Deployment Script
# This script deploys IcarusFlow to Vercel

set -e

echo "🚀 IcarusFlow Deployment"
echo "========================"
echo ""

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found!"
    echo ""
    echo "Installing Vercel CLI..."
    npm install -g vercel
    echo "✅ Vercel CLI installed"
    echo ""
fi

# Check if logged in
echo "Checking Vercel login status..."
if ! vercel whoami &> /dev/null; then
    echo "Not logged in to Vercel. Please login:"
    vercel login
fi

echo ""
echo "📦 Building project..."
npm run build

echo ""
echo "🌐 Deploying to Vercel..."
echo ""
echo "Choose deployment type:"
echo "  1) Preview deployment (test first)"
echo "  2) Production deployment"
echo ""
read -p "Enter choice (1 or 2): " choice

case $choice in
    1)
        echo ""
        echo "Deploying preview..."
        vercel
        ;;
    2)
        echo ""
        echo "Deploying to production..."
        vercel --prod
        ;;
    *)
        echo "Invalid choice. Deploying preview..."
        vercel
        ;;
esac

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Visit the URL shown above"
echo "2. Test the application"
echo "3. If everything works, deploy to production with: npm run deploy:prod"
