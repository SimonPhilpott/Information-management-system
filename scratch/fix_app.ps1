$path = "d:\Information management system\src\App.jsx"
$content = Get-Content -Path $path
# We want: 
# 554: </div> (mode buttons)
# 555: </div> (gov card)
# 556: </div> (absolute overlay)
$content[554] = "              </div>"
$content[555] = "            </div>"
$content[556] = "          </div>"
# Remove any extra line that might be there (the old 557)
$newContent = $content[0..556] + $content[558..($content.Length -1)]
$newContent | Set-Content -Path $path
