import os
import json
import sys

# Set standard output encoding to utf-8
sys.stdout.reconfigure(encoding='utf-8')

brain_dir = r"C:\Users\sideb\.gemini\antigravity-ide\brain"
matches = []

for folder in os.listdir(brain_dir):
    folder_path = os.path.join(brain_dir, folder)
    if not os.path.isdir(folder_path):
        continue
    
    transcript_path = os.path.join(folder_path, ".system_generated", "logs", "transcript.jsonl")
    if os.path.exists(transcript_path):
        try:
            with open(transcript_path, 'r', encoding='utf-8', errors='ignore') as f:
                for line_num, line in enumerate(f, 1):
                    if 'Definition Summary' in line and ('"content"' in line or 'mesh_authority' in line):
                        # Let's record the folder, line number and some content
                        matches.append((folder, line_num, line))
        except Exception as e:
            print(f"Error reading {transcript_path}: {e}")

print(f"Found {len(matches)} matches:")
for m in matches:
    # Print folder, line, and a snippet containing "Definition Summary" safely
    snippet = m[2]
    idx = snippet.find("Definition Summary")
    start = max(0, idx - 50)
    end = min(len(snippet), idx + 250)
    print(f"Folder: {m[0]} | Line: {m[1]} | Snippet: ... {snippet[start:end]} ...")
