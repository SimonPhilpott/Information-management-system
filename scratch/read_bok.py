import openpyxl
import json

wb = openpyxl.load_workbook(r"d:\Information management system\BoK.xlsx")
sheet = wb.active
rows = list(sheet.iter_rows(values_only=True))

print("Total rows:", len(rows))
for i, r in enumerate(rows[:20]):
    print(f"Row {i}: {r}")
