import os

for root, dirs, files in os.walk(r"d:\Information management system"):
    for file in files:
        if file == ".env":
            print(os.path.join(root, file))
