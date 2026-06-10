import openpyxl
import json
import re

def slugify(text):
    if not text:
        return ""
    text = text.lower().strip()
    text = re.sub(r'[^a-z0-9]+', '_', text)
    text = re.sub(r'_+', '_', text)
    return text.strip('_')

wb = openpyxl.load_workbook(r"d:\Information management system\BoK.xlsx")
sheet = wb.active
rows = list(sheet.iter_rows(values_only=True))

new_nodes = []

# Add parent node Body of Knowledge
new_nodes.append({
    "id": "bok_root",
    "type": "CONCEPT",
    "title": "Body of Knowledge",
    "parentId": "cap_root"
})

for i, r in enumerate(rows):
    title = r[0]
    info = r[1]
    
    if not title:
        continue
        
    node_id = f"bok_{slugify(title)}"
    
    node = {
        "id": node_id,
        "type": "CONCEPT",
        "title": title.strip(),
        "parentId": "bok_root"
    }
    
    if info and str(info).strip():
        node["content"] = {
            "Definition Summary": str(info).strip()
        }
        
    new_nodes.append(node)

# Write to file
with open(r"d:\Information management system\scratch\bok_nodes.json", "w", encoding="utf-8") as f:
    json.dump(new_nodes, f, indent=2, ensure_ascii=False)

print(f"Successfully generated {len(new_nodes)} nodes.")
