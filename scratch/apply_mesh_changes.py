import json

# Load the generated BoK nodes
with open(r"d:\Information management system\scratch\bok_nodes.json", "r", encoding="utf-8") as f:
    bok_nodes = json.load(f)

# Format bok nodes as JS object strings
lines = []
lines.append("\n  // --- BODY OF KNOWLEDGE ---")
for node in bok_nodes:
    # Build single line representation for compactness
    line = f'  {json.dumps(node, ensure_ascii=False)},'
    lines.append(line)

inserted_text = "\n".join(lines) + "\n"

# Read mesh_authority.js
with open(r"d:\Information management system\src\data\mesh_authority.js", "r", encoding="utf-8") as f:
    content = f.read()

# Locate the last ];
if "];" in content:
    # Find the last occurrence of ];
    idx = content.rfind("];")
    # Insert before the closing bracket
    new_content = content[:idx] + inserted_text + content[idx:]
    
    with open(r"d:\Information management system\src\data\mesh_authority.js", "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Successfully inserted BoK nodes into mesh_authority.js.")
else:
    print("Error: closing bracket ]; not found in mesh_authority.js")
