import subprocess

try:
    res = subprocess.run(["git", "diff", "src/data/mesh_authority.json"], capture_output=True, text=True, cwd=r"d:\Information management system")
    lines = res.stdout.splitlines()
    print("Deleted lines in mesh_authority.json:")
    for line in lines:
        if line.startswith("-") and not line.startswith("---"):
            print(line)
except Exception as e:
    print("Error:", e)
