# Renders the cover of each game's main book in the D&D folder into public/kn/covers/<id>.jpg (about 520 px wide),
# for the beta's library cards. usage: python scripts/extract_game_covers.py
import os, io, sys
import pymupdf
from PIL import Image

ROOT = 'G:/My Drive/BOOKS/D&D'
OUT = 'public/kn/covers'
COVERS = {
    'ker-nethalas': 'Ker Nathalas/Ker Nethalas_ Into the Midnight Throne.pdf',
    'ironsworn': 'Ironsworn/Ironsworn.pdf',
    'ironsworn-starforged': 'Ironsworn/Ironsworn_ Starforged Rulebook.pdf',
    'ironsworn-delve': 'Ironsworn/Ironsworn Delve.pdf',
    'alien-rpg': 'Alien RPG/ALIEN RPG - Building Better Worlds_iFwtGZ.pdf',
    'across-a-thousand-dead-worlds': 'Across a Thousand Dead Worlds/Across a Thousand Dead Worlds - Core Rulebook.pdf',
    'barbarian-prince': 'Barbarian Prince/BP2-eventsbook_singleA4.pdf',
    'campfire-story': 'CAMPFIRE STORY/CAMPFIRE_STORY.pdf',
    'doom-pilgrim': 'Doom Pilgrim/Doom Pilgrim basic rules.pdf',
    'last-days-zombie-apocalypse': 'Last Days Zombie Apocalypse/Last Days Zombie Apocalypse/Osprey - LDZA - Last Days Zombie Apocalypse (red).pdf',
    'thousand-year-old-vampire': 'Thousand Year Old Vampire.pdf',
    'thousand-year-old-campfire': 'Thousand Year Old Campfire/Thousand Year Old Campfire.pdf',
    'tales-from-the-loop': 'Tales from the loop/Tales from the Loop - Rulebook.pdf',
    'dnd-5e': "D&D 5E/Rulebooks/Core/Player's Handbook.pdf",
    'warhammer-fantasy-roleplay': 'Warhammer Fantasy Roleplay - Compilation v1/Warhammer Fantasy Roleplay - Rulebook - 2005 - 3rd Edition.pdf',
}
os.makedirs(OUT, exist_ok=True)
only = set(sys.argv[1:])
for gid, rel in COVERS.items():
    if only and gid not in only: continue
    out = f'{OUT}/{gid}.jpg'
    if os.path.exists(out): print('have', gid); continue
    try:
        d = pymupdf.open(f'{ROOT}/{rel}')
        page = d[0]
        zoom = 560 / page.rect.width
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom))
        img = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')
        img.save(out, 'JPEG', quality=80, optimize=True)
        print('ok', gid, img.size)
    except Exception as e:
        print('fail', gid, e)
    sys.stdout.flush()
