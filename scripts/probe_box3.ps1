# IMS Hardware & OTA Network Probe Script
$ErrorActionPreference = "SilentlyContinue"

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  IMS Network & Hardware Status Probe" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# 1. Probe local servers
$ports = @(
    @{ Name = "IMS Main UI"; Host = "127.0.0.1"; Port = 6001 },
    @{ Name = "PDF KB API"; Host = "127.0.0.1"; Port = 3001 },
    @{ Name = "Hardware Raw TCP"; Host = "127.0.0.1"; Port = 3002 },
    @{ Name = "Device HTTP/Camera"; Host = "127.0.0.1"; Port = 3003 },
    @{ Name = "PDF KB Client UI"; Host = "127.0.0.1"; Port = 5173 }
)

foreach ($p in $ports) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $iar = $client.BeginConnect($p.Host, $p.Port, $null, $null)
        $success = $iar.AsyncWaitHandle.WaitOne(800)
        if ($success -and $client.Connected) {
            Write-Host "  [OK] $($p.Name) (Port $($p.Port)) - Listening" -ForegroundColor Green
        } else {
            Write-Host "  [--] $($p.Name) (Port $($p.Port)) - Offline / Starting" -ForegroundColor Yellow
        }
        $client.Close()
    } catch {
        Write-Host "  [--] $($p.Name) (Port $($p.Port)) - Offline" -ForegroundColor Yellow
    }
}

# 2. Probe ESP32-S3-BOX-3 Wi-Fi OTA Port 3232
Write-Host "`n  Probing ESP32-S3-BOX-3 over Wi-Fi (192.168.1.92:3232)..." -ForegroundColor Cyan
$otaClient = [System.Net.Sockets.TcpClient]::new()
try {
    $iar = $otaClient.BeginConnect("192.168.1.92", 3232, $null, $null)
    $success = $iar.AsyncWaitHandle.WaitOne(1500)
    if ($success -and $otaClient.Connected) {
        $stream = $otaClient.GetStream()
        $stream.ReadTimeout = 1000
        $reader = [System.IO.StreamReader]::new($stream)
        $resp = $reader.ReadLine()
        Write-Host "  [PASS] ESP32 OTA Port 3232 Online: $resp" -ForegroundColor Green
        Write-Host "         Box-3 is ready for Wi-Fi OTA updates and remote connection." -ForegroundColor Green
        $otaClient.Close()
    } else {
        Write-Host "  [FAIL] ESP32 OTA Port 3232 unreachable at 192.168.1.92" -ForegroundColor Red
        Write-Host "         Ensure Box-3 is powered on and connected to local Wi-Fi." -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [FAIL] ESP32 OTA probe error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "======================================================`n" -ForegroundColor Cyan
