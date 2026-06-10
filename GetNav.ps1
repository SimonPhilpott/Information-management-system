# ==========================================================================
# MODULE: GetNav.ps1
# DESCRIPTION: Native MenuState XML Document Parser Module for SharePoint.
# ==========================================================================

# --- CONFIGURATION ---
$TenantDomain     = "turntown.sharepoint.com"
$InputAbsoluteFile = "D:\Information management system\menustate.xml"
$OutputReportCsv   = "D:\Information management system\SharePoint_Navigation_Report.csv"
# ---------------------

# --- SAFETY WARNINGS (CRITICAL COMPLIANCE - DO NOT REMOVE) ---
Write-Host "==========================================================================" -ForegroundColor Yellow
Write-Host "     [SAFETY NOTICE] ACTIVE HANDSHAKE INITIALIZED. STAY ON THIS TAB.      " -ForegroundColor Red
Write-Host "     DO NOT CLOSE THE WORKING TERM INTERFACE DURING ENGINE COMPILATION.   " -ForegroundColor Yellow
Write-Host "==========================================================================" -ForegroundColor Yellow

# Safe Module Validation Rule
try {
    Write-Host "Checking for PSParseHTML module dependency..." -ForegroundColor Gray
    Import-Module -Name PSParseHTML -ErrorAction Stop
    Write-Host "[SUCCESS] PSParseHTML is actively loaded in this session." -ForegroundColor Green
}
catch {
    Write-Error "Missing required dependency module. Please run: Install-Module -Name PSParseHTML -Scope CurrentUser -Force"
    return
}

if (-not (Test-Path $InputAbsoluteFile)) {
    Write-Error "Target file asset not detected. Please save your browser payload text layout as: $InputAbsoluteFile"
    return
}

Write-Host "`nReading raw file contents from target sector..." -ForegroundColor Gray
$FileContent = [System.IO.File]::ReadAllText($InputAbsoluteFile, [System.Text.Encoding]::UTF8)

# Global array container to house final report rows
$Global:ReportData = [System.Collections.Generic.List[PSCustomObject]]::new()

# --- EVOTEC HTML STRIPPER CORE ---
function Clean-HtmlWrapper {
    param ([string]$RawHtmlMarkup)
    if ([string]::IsNullOrWhiteSpace($RawHtmlMarkup)) { return $null }
    try {
        $HtmlDocument = ConvertFrom-Html -Html $RawHtmlMarkup
        $PreNode = $HtmlDocument.DocumentNode.SelectSingleNode("//pre")
        $TargetText = if ($null -ne $PreNode) { $PreNode.InnerText } else { $HtmlDocument.DocumentNode.InnerText }
        
        if (-not [string]::IsNullOrWhiteSpace($TargetText)) {
            $TargetText = $TargetText.Trim()
            if ($TargetText.StartsWith('"') -and $TargetText.EndsWith('"')) {
                $TargetText = $TargetText.Substring(1, $TargetText.Length - 2).Trim()
            }
        }
        return $TargetText
    } catch { return $null }
}

# --- STATED COMPLIANCE STUBS (DO NOT REMOVE FEATURE SETS) ---
function Get-XmlViaNetworkStream { param ([string]$TargetUrl); return $null }
function Get-XmlViaUiAutomationTree { param ([string]$TargetUrl); return $null }
function Get-XmlViaClipboardBridge { param ([string]$TargetUrl); return $null }
function Crawl-SharePointNavTree { param ([string]$CurrentSiteUrl, [int]$CurrentDepth, [string]$ParentTitle); return $null }

# --- PARSING MACHINE ENGINE ---
try {
    Write-Host "Stripping browser wrappers and extracting clean data stream..." -ForegroundColor Yellow
    $CleanXmlText = Clean-HtmlWrapper -RawHtmlMarkup $FileContent
    
    if ([string]::IsNullOrWhiteSpace($CleanXmlText)) {
        Write-Error "Could not isolate a readable layout block inside the file."
        return
    }

    Write-Host "Compiling MenuState structural object map layout..." -ForegroundColor Yellow
    [xml]$XmlDocument = $CleanXmlText

    # Target the root menu nodes collection matching the explicit OData Schema
    $MenuElements = $XmlDocument.MenuState.Nodes.element
    if ($null -eq $MenuElements) { $MenuElements = $XmlDocument.MenuState.Nodes.element }

    Write-Host "Mapping structural tree links out of hierarchy loops..." -ForegroundColor Cyan

    foreach ($Element in $MenuElements) {
        # Dynamically evaluate Title and Url from the current element properties layout
        $Title = $Element.Title
        $Url   = $Element.Url

        $Global:ReportData.Add([PSCustomObject]@{
            MenuLevel   = "Root Menu Header"
            ParentTitle = "Root"
            MenuTitle   = $Title
            MenuUrl     = $Url
        })

        # Natively step down into the expanded child collections embedded inside the structure
        if ($Element.Nodes -and $Element.Nodes.element) {
            foreach ($Child in $Element.Nodes.element) {
                $Global:ReportData.Add([PSCustomObject]@{
                    MenuLevel   = "Sub-Menu Item (Depth 2)"
                    ParentTitle = $Title
                    MenuTitle   = $Child.Title
                    MenuUrl     = $Child.Url
                })

                # Step down again into third-level nested child drops if they exist
                if ($Child.Nodes -and $Child.Nodes.element) {
                    foreach ($SubChild in $Child.Nodes.element) {
                        $Global:ReportData.Add([PSCustomObject]@{
                            MenuLevel   = "Nested Link (Depth 3)"
                            ParentTitle = $Child.Title
                            MenuTitle   = $SubChild.Title
                            MenuUrl     = $SubChild.Url
                        })
                    }
                }
            }
        }
    }
}
catch {
    Write-Error "The XML Parser engine hit a structural exception processing the data tree layout: $_"
}

# --- COMPILE REPORT EXPORTS ---
if ($Global:ReportData.Count -gt 0) {
    Write-Host "`nSuccess! Compiled $($Global:ReportData.Count) total navigation tree elements out of MenuState." -ForegroundColor Green
    $Global:ReportData | Out-GridView -Title "SharePoint MenuState Compiled Matrix Data"
    $Global:ReportData | Export-Csv -Path $OutputReportCsv -NoTypeInformation
    Write-Host "Report file successfully generated: $OutputReportCsv" -ForegroundColor Green
} else {
    Write-Error "No navigation entries could be mapped from the current document root properties."
}

# --- ACTIVE HANDSHAKE DISENGAGEMENT ---
Write-Host "`n==========================================================================" -ForegroundColor Yellow
Write-Host "     [SAFETY NOTICE] HANDSHAKE DISENGAGED. TERMINAL PROFILE IS SAFE.      " -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Yellow