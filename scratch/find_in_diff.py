with open("scratch/diff_utf8.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()

print("Searching diff for keywords...")
keywords = ["uki_ccm", "commercial", "insolvency", "interim", "valuations", "insurance", "reinstatement", "cost planning"]

current_file = ""
for line in lines:
    if line.startswith("diff --git"):
        current_file = line.strip()
    for kw in keywords:
        if kw in line.lower():
            print(f"[{current_file}] {line.strip()}")
            break
