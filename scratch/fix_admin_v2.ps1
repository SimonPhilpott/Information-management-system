$path = 'd:\Information management system\src\components\Admin\AdminPanel.jsx'
$content = Get-Content $path
$content[436] = '                         ))}'
$content | Set-Content $path
