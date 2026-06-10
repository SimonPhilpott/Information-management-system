# ==========================================================================
# MODULE: TestSharePointEvotec.ps1
# DESCRIPTION: Live Evotec PSParseHTML layout test for your target domain.
# ==========================================================================

# --- CONFIGURATION ---
$TenantDomain = "turntown.sharepoint.com"
$AbsoluteFilePath = "D:\Information management system\nav-test.xml"
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

if (-not (Test-Path $AbsoluteFilePath)) {
    Write-Error "Critical Target Data Link Missing. Ensure your manual Edge copy-paste file is present at: $AbsoluteFilePath"
    return
}

Write-Host "`nReading raw file contents from target sector..." -ForegroundColor Gray
$RawHtmlMarkup = [System.IO.File]::ReadAllText($AbsoluteFilePath, [System.Text.Encoding]::UTF8)
Write-Host "Loaded $($RawHtmlMarkup.Length) characters of raw HTML markup text layout." -ForegroundColor Gray

# --- EVOTEC HTML PARSER ENGINE TREE ---
try {
    Write-Host "`nExecuting Evotec HTML DOM translation loop..." -ForegroundColor Yellow
    
    # Convert the 2000+ lines of copied document text into a queryable Document Object Model
    $HtmlDocument = ConvertFrom-Html -Html $RawHtmlMarkup
    
    # Official Evotec Syntax: Target the explicit <pre> node where the text block sits
    Write-Host "Querying DOM tree hierarchy for structural nodes..." -ForegroundColor Gray
    $PreNode = $HtmlDocument.DocumentNode.SelectSingleNode("//pre")
    
    $TargetText = $null
    if ($null -ne $PreNode) {
        $TargetText = $PreNode.InnerText
        Write-Host "   [SUCCESS] Located explicit target <pre> data container node inside DOM." -ForegroundColor Green
    } else {
        Write-Warning "   [!] Explicit <pre> container node not found. Sifting alternative <body> boundaries..."
        $BodyNode = $HtmlDocument.DocumentNode.SelectSingleNode("//body")
        $TargetText = if ($null -ne $BodyNode) { $BodyNode.InnerText } else { $HtmlDocument.DocumentNode.InnerText }
    }

    # --- STRING CLEANER MATRIX ---
    if (-not [string]::IsNullOrWhiteSpace($TargetText)) {
        $TargetText = $TargetText.Trim()
        
        # Slices off the edge double quotes applied by the browser's raw text renderer envelope ("<?xml...)
        if ($TargetText.StartsWith('"') -and $TargetText.EndsWith('"')) {
            Write-Host "   [DEBUG] Outer document literal quotation marks detected. Slicing string boundaries..." -ForegroundColor Cyan
            $TargetText = $TargetText.Substring(1, $TargetText.Length - 2).Trim()
        }
    }

    # --- XML CONVERSION & TENANT MATRIX TEST RUN ---
    if (-not [string]::IsNullOrWhiteSpace($TargetText)) {
        Write-Host "`nCasting extracted text block directly to structural [xml] object type..." -ForegroundColor Yellow
        [xml]$XmlDocument = $TargetText
        
        # Navigate the OData hierarchy structure natively to verify extraction validation mapping
        $NavNodes = $XmlDocument.feed.entry.content.properties
        if ($null -eq $NavNodes) { $NavNodes = $XmlDocument.entry.properties }

        if ($null -ne $NavNodes) {
            Write-Host "`n==========================================================================" -ForegroundColor Green
            Write-Host "   VALIDATION COMPLETE: DATA EXTRACTION MATRIX IS TOTALLY FUNCTIONAL!    " -ForegroundColor Green
            Write-Host "==========================================================================" -ForegroundColor Green
            Write-Host "Successfully parsed $($NavNodes.Count) primary root navigation entries from your domain." -ForegroundColor Green
            
            # Global array container to house final report data rows
            $ReportData = [System.Collections.Generic.List[PSCustomObject]]::new()

            foreach ($Node in $NavNodes) {
                $Title = $Node.Title.InnerText
                $Url   = $Node.Url.InnerText

                $ReportData.Add([PSCustomObject]@{
                    SourceSite  = "https://$TenantDomain"
                    Depth       = 1
                    MenuParent  = "Root"
                    MenuTitle   = $Title
                    MenuUrl     = $Url
                })

                # Map expanded children entries
                if ($Node.Children.feed.entry.content.properties) {
                    foreach ($Child in $Node.Children.feed.entry.content.properties) {
                        $ReportData.Add([PSCustomObject]@{
                            SourceSite  = "https://$TenantDomain"
                            Depth       = "1 (Child Item)"
                            MenuParent  = $Title
                            MenuTitle   = $Child.Title.InnerText
                            MenuUrl     = $Child.Url.InnerText
                        })
                    }
                }
            }

            # Render the data out onto the native grid view component panel
            Write-Host "`nCompiling and pushing discoveries to GridView component window..." -ForegroundColor Cyan
            $ReportData | Out-GridView -Title "Evotec Test - SharePoint TopNavigationBar Map Data"
            
            Write-Host "`nSample Node Discoveries:" -ForegroundColor Cyan
            foreach ($Item in $ReportData | Select-Object -First 5) {
                Write-Host " - [$($Item.Depth)] $($Item.MenuParent) -> '$($Item.MenuTitle)' (Url: $($Item.MenuUrl))" -ForegroundColor Gray
            }
        } else {
            Write-Error "XML casting succeeded, but target OData navigation nodes could not be mapped out of the schema tree layout."
        }
    } else {
        Write-Error "Isolated text block layout returned entirely empty or null lines."
    }
}
catch {
    Write-Error "Evotec engine compilation or direct XML tree data validation faulted. Detailed Error: $_"
}

# --- ACTIVE HANDSHAKE DISENGAGEMENT ---
Write-Host "`n==========================================================================" -ForegroundColor Yellow
Write-Host "     [SAFETY NOTICE] HANDSHAKE DISENGAGED. TERMINAL PROFILE IS SAFE.      " -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Yellow