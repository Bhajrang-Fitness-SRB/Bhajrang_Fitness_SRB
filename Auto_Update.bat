@echo off
echo ==============================================
echo 🚀 BHAJRANG FITNESS - AUTO DEPLOYMENT INITIATED...
echo ==============================================

git add .
git commit -m "Auto Update: %date% %time%"
git push origin Bhajrang-Fitness-SRB

echo ==============================================
echo ✅ DONE! Live Server is updating automatically...
echo ==============================================
pause