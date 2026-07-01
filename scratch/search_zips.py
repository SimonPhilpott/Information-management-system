import zipfile
import os

backups_dir = r"d:\Information management system\backups"
for filename in os.listdir(backups_dir):
    if filename.endswith(".zip"):
        filepath = os.path.join(backups_dir, filename)
        try:
            with zipfile.ZipFile(filepath, 'r') as zip_ref:
                for name in zip_ref.namelist():
                    try:
                        content = zip_ref.read(name).decode('utf-8', errors='ignore')
                        if "insolvency" in content.lower():
                            print(f"Match found in archive: {filename}")
                            print(f"  File: {name}")
                            # Print lines containing it
                            for line in content.splitlines():
                                if "insolvency" in line.lower():
                                    print(f"    {line.strip()}")
                    except Exception as e:
                        pass
        except Exception as e:
            print(f"Error reading {filename}: {e}")
