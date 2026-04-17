$timestamp = Get-Date -Format "yyyyMMdd_HHmm"
$zipPath = "backups\HIVE_MESH_RECOVERY_$timestamp.zip"
Compress-Archive -Path "src", "public", "package.json", "index.html", "vite.config.js" -DestinationPath $zipPath -Force
Write-Host "Backup created at $zipPath"
