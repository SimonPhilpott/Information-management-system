import json
import re

with open(r"d:\Information management system\usergroups.json", 'r', encoding='utf-8') as f:
    content = f.read()

# Find all occurrences of Shared Documents/GBPM/G_B_P_M_<something>_V1.docx
matches = re.findall(r'Shared Documents/GBPM/G_B_P_M_([^_]+)_V1\.docx', content)
print("Matches found in usergroups.json:")
for m in sorted(list(set(matches))):
    print(f"  - {m}")
