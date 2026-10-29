# Extracts the Ker Nethalas D-tables (room/corridor descriptions, events, growing darkness, scavenging) from the
# rulebook PDF by word position (the numbers are vertically centred in their rows, so plain text order is unreliable).
# usage: python scripts/extract_kn_tables.py  -> src/components/DndBeta/kn/bookTables.json
import re, json, sys, pymupdf
PDF = "G:/My Drive/BOOKS/D&D/Ker Nathalas/Ker Nethalas_ Into the Midnight Throne.pdf"
doc = pymupdf.open(PDF)
NUM = re.compile(r'^(\d{1,3})(?:[-\u2013](\d{1,3}))?$')
def fix(s):
    s=re.sub(r'7(?=[A-Za-z])','f',s)
    return (s.replace('\ufb01','fi').replace('\ufb02','fl').replace('\u00ad','').replace('\u2019',"'"))
def page_entries(pi, maxnum, col_max=95):
    pg = doc[pi]; H = pg.rect.height
    words = [w for w in pg.get_text("words") if 30 < w[1] < H-45]
    nums = []
    for w in words:
        x0,y0,x1,y1,t = w[:5]
        m = NUM.match(t)
        if x0 < col_max and m and int(m.group(1)) <= maxnum: nums.append(w)
    nums.sort(key=lambda w: w[1])
    if not nums: return []
    colx = max(w[2] for w in nums)
    # text lines to the right of the number column
    tw = sorted([w for w in words if w[0] > colx+2], key=lambda w:(w[1]+w[3])/2)
    lines=[]
    for w in tw:
        yc=(w[1]+w[3])/2
        if lines and abs(lines[-1]['y']-yc) < 3.2: lines[-1]['w'].append(w)
        else: lines.append({'y':yc,'w':[w]})
    for l in lines:
        l['w'].sort(key=lambda w:w[0]); l['t']=' '.join(w[4] for w in l['w'])
    HEAD = re.compile(r'(CONTINUED|^D\d+ |ROOM DESCRIPTION|CORRIDOR DESCRIPTION|GROWING DARKNESS|EVENTS$|Gravebound Edition|Chapter [IVX]+:)')
    lines=[l for l in lines if not HEAD.search(l['t']) or len(l['t'])>60 and not re.search(r'Gravebound|CONTINUED',l['t'])]
    def nearest(y): return min(range(len(lines)), key=lambda i: abs(lines[i]['y']-y))
    idx=[nearest((w[1]+w[3])/2) for w in nums]
    cuts=[0]
    for a,b in zip(idx,idx[1:]):
        if b<=a: cuts.append(a+1); continue
        gaps=[(lines[k+1]['y']-lines[k]['y'],k) for k in range(a,b)]
        mx=max(g for g,_ in gaps); ks=[k for g,k in gaps if abs(g-mx)<0.6]
        cuts.append(ks[len(ks)//2]+1)
    cuts.append(len(lines))
    out=[]
    for i,w in enumerate(nums):
        seg=lines[cuts[i]:cuts[i+1]]
        out.append({'k':w[4],'text':fix(' '.join(l['t'] for l in seg))})
    return out
def collect(pages, maxnum):
    res=[]
    for p in pages: res+=page_entries(p,maxnum)
    return res
if __name__=='__main__':
    import os
    spec = json.loads(sys.argv[1]) if len(sys.argv)>1 else {}
    data={}
    data['corridor']=collect([99,100],20)   # book pages 100-101
    data['room']=collect(range(101,107),100) # 102-107
    data['events']=collect(range(107,115),100) # 108-115
    data['darkness']=collect([119,120,121],100) # 120-122
    # tidy: split the Overseer table off the corridor pages, fix the few rows a page edge cut
    over=[dict(e,text=e['text'].replace('OVERSEER INFLUENCE','').strip()) for e in data['corridor'][:10]]
    cor=data['corridor'][10:]
    cor[8]['text']='An eerie silence fills this corridor, broken only by the faint whispers of long-dead spirits. The air is heavy with an otherworldly stillness.'
    dk=data['darkness']; dk[0]['text']=dk[0]['text'][dk[0]['text'].index('A choir of howls'):]
    def rng(k):
        a,_,b=k.partition('-'); return [int(a),int(b or a)]
    def pack(rows): return [{'lo':rng(e['k'])[0],'hi':rng(e['k'])[1],'text':e['text'].strip()} for e in rows]
    out={'source':'Ker Nethalas: Into the Midnight Throne (Gravebound Edition)',
         'overseer':{'page':100,'die':'d10','rows':pack(over)},'corridor':{'page':100,'die':'d20','rows':pack(cor)},
         'room':{'page':102,'die':'d100','rows':pack(data['room'])},'events':{'page':108,'die':'d100','rows':pack(data['events'])},
         'darkness':{'page':120,'die':'d100','rows':pack(dk)}}
    os.makedirs('src/components/DndBeta/kn',exist_ok=True)
    json.dump(out,open('src/components/DndBeta/kn/bookTables.json','w',encoding='utf-8'),indent=1,ensure_ascii=False)
    for k,v in out.items():
        if isinstance(v,dict): print(k,len(v['rows']))
    sys.exit(0)
    os.makedirs('src/components/DndBeta/kn',exist_ok=True)
    json.dump(data,open('src/components/DndBeta/kn/bookTables.raw.json','w',encoding='utf-8'),indent=1,ensure_ascii=False)
    for k,v in data.items(): print(k,len(v))
