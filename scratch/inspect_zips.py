import zipfile
import os

backups_dir = r"d:\Information management system\backups"
for filename in os.listdir(backups_dir):
    if filename.endswith(".zip"):
        filepath = os.path.join(backups_dir, filename)
        try:
            with zipfile.ZipFile(filepath, 'r') as zip_ref:
                print(f"Archive: {filename}")
                for info in zip_ref.infolist():
                    if "mesh_authority" in info.filename or "nodes.js" in info.filename:
                        print(f"  {info.filename} - size: {info.file_size} bytes")
        except Exception as e:
            print(f"Error reading {filename}: {e}")

backup_root_dir = r"d:\Information management system\backup"
for filename in os.listdir(backup_root_dir):
    if filename.endswith(".zip"):
        filepath = os.path.join(backup_root_dir, filename)
        try:
            with zipfile.ZipFile(filepath, 'r') as zip_ref:
                print(f"Archive in backup/: {filename}")
                for info in zip_ref.infolist():
                    if "mesh_authority" in info.filename or "nodes.js" in info.filename:
                        print(f"  {info.filename} - size: {info.file_size} bytes")
        except Exception as e:
            print(f"Error reading {filename} in backup/: {e}")
