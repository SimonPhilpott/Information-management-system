$path = "d:\Information management system\src\components\Admin\AdminPanel.jsx"
$content = Get-Content -Raw -Path $path -Encoding utf8
$newContent = $content -replace "旋旋\)\}", ""
$newContent | Set-Content -Path $path -Encoding utf8
