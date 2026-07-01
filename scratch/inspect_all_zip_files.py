import zipfile
import os

backups_dir = r"d:\Information management system\backups"
for filename in os.listdir(backups_dir):
    if filename.endswith(".zip"):
        filepath = os.path.join(backups_dir, filename)
        try:
            with zipfile.ZipFile(filepath, 'r') as zip_ref:
                print(f"Archive: {filename}")
                names = zip_ref.namelist()
                # Print any JSON or text files, or files in src/data
                for name in names:
                    if name.endswith(".json") or "src/data/" in name or "db/" in name:
                        print(f"  {name} ({zip_ref.getinfo(name).file_size} bytes)")
        except Exception as e:
            print(f"Error reading {filename}: {e}")
