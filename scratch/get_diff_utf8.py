import subprocess

res = subprocess.run(["git", "diff"], capture_output=True, text=True, encoding="utf-8")
with open("scratch/diff_utf8.txt", "w", encoding="utf-8") as f:
    f.write(res.stdout)
print("Saved git diff to scratch/diff_utf8.txt")
