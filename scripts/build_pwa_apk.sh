# scripts/build_pwa_apk.sh
# This script shows how to build an APK/AAB using Bubblewrap locally. It requires Node, Java JDK, and Android SDK.
# This does NOT run inside CI here; run locally on your machine.

echo "Install bubblewrap: npm i -g @bubblewrap/cli"
echo "Initialize: bubblewrap init --manifest https://your-site/manifest.json"
echo "Build: bubblewrap build"

echo "Alternatively use PWABuilder: https://www.pwabuilder.com — upload your site URL to get an APK/AAB"
