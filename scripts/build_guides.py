#!/usr/bin/env python3
"""Generate static bilingual guide pages from index.html. Run from any directory.
Dependency: beautifulsoup4==4.14.3. Add German translations to guide_de.json
when changing source copy; missing translations abort before any files are written.
"""
from pathlib import Path
from copy import deepcopy
from html import escape as esc
import json, re
from bs4 import BeautifulSoup, Comment
ROOT=Path(__file__).resolve().parents[1]
BASE='https://gugubasel.ch'
source=(ROOT/'index.html').read_text()
soup=BeautifulSoup(source,'html.parser')
translations=json.loads((ROOT/'scripts/guide_de.json').read_text())
# slug EN, slug DE, title EN, title DE, source selector, parent category
GUIDES=[
('rainydays','regentage','Rainy-day activities with kids in Basel','Aktivitäten mit Kindern bei Regen in Basel','#rainy-day-ideas',None),
('brunch','brunch-mit-kindern','Family-friendly brunch in Basel','Brunch mit Kindern in Basel','#family-friendly-brunch-restaurants','eat-drink'),
('cafes','familiencafes','Family-friendly cafés in Basel and nearby','Familiencafés in Basel und Umgebung','#family-friendly-cafes','eat-drink'),
('birthday-venues','kindergeburtstag','Children’s birthday venues in Basel and nearby','Kindergeburtstag feiern in Basel und Umgebung','#birthday-venues','birthday'),
('herbstmesse-delicacies','herbstmesse-leckereien','Basel Herbstmesse treats for families','Leckereien an der Basler Herbstmesse für Familien','#evergreen-herbstmesse-delicacies-2026','seasonal-picks'),
('herbstmesse','herbstmesse-mit-kindern','Basel Herbstmesse 2026 with kids','Basler Herbstmesse 2026 mit Kindern','#evergreen-herbstmesse-2026','seasonal-picks'),
('autumn-day-trips','herbstausfluege','Autumn day trips with kids from Basel','Herbstausflüge mit Kindern ab Basel','#autumn-day-trips','seasonal-picks'),
('halloween','halloween-mit-kindern','Halloween 2026 events for kids in Basel and nearby','Halloween 2026 für Kinder in Basel und Umgebung','#halloween-parties-2026','seasonal-picks'),
('farms','bauernhoefe','Farms to visit with kids near Basel','Bauernhöfe mit Kindern rund um Basel besuchen','#family-guide-farms','places-to-go')]
HUBS=[
('eat-drink','essen-trinken','Eat & drink with kids in Basel','Essen und Trinken mit Kindern in Basel'),
('birthday','geburtstag','Children’s birthdays in Basel','Kindergeburtstage in Basel'),
('seasonal-picks','saisonale-tipps','Seasonal family activities in Basel','Saisonale Familienaktivitäten in Basel'),
('places-to-go','ausflugsziele','Places to go with kids near Basel','Ausflugsziele mit Kindern rund um Basel'),
('things-to-do','aktivitaeten','Things to do with kids in Basel','Aktivitäten mit Kindern in Basel'),
('family-life','familienleben','Family life in Basel','Familienleben in Basel'),
('trips-outdoors','ausfluege-natur','Family trips & outdoors near Basel','Familienausflüge und Natur rund um Basel')]
HEADINGS={
'EAT & DRINK':'ESSEN UND TRINKEN','BIRTHDAY':'GEBURTSTAG','SEASONAL PICKS':'SAISONALE TIPPS','PLACES TO GO':'AUSFLUGSZIELE','Brunch':'Brunch','Herbstmesse Delicacies':'Herbstmesse-Leckereien','Herbstmesse':'Herbstmesse','Halloween':'Halloween','RAINY-DAY IDEAS':'IDEEN FÜR REGENTAGE','NEW':'NEU','INDOOR PLAY & FAMILY CAFÉS':'INDOORSPIELEN UND FAMILIENCAFÉS','Picture':'Bild','Details':'Infos',
'ACTIVE INDOOR PLAYGROUNDS':'AKTIVE INDOORSPIELPLÄTZE','BOWLING & INDOOR GAMES':'BOWLING UND INDOORSPIELE','INTERACTIVE MUSEUMS & DISCOVERY':'INTERAKTIVE MUSEEN UND ENTDECKUNGEN','QUIET & BUDGET-FRIENDLY ACTIVITIES':'RUHIGE UND GÜNSTIGE AKTIVITÄTEN','INDOOR WATER FUN':'WASSERSPASS DRINNEN','Cafe':'Café','DEDICATED PLAY CAFÉS':'CAFÉS MIT EIGENEM SPIELBEREICH','FAMILY-FRIENDLY CAFÉS':'FAMILIENFREUNDLICHE CAFÉS','BEST FOR CAFÉ + NEARBY PLAYGROUND':'CAFÉ MIT SPIELPLATZ IN DER NÄHE','Venue':'Feierorte','INDOOR PLAY':'INDOORSPIELEN','ACTIVE & SPORTS':'BEWEGUNG UND SPORT','ANIMALS & NATURE':'TIERE UND NATUR','ART & CREATIVITY':'KUNST UND KREATIVITÄT','THEATRE & THEMED PARTIES':'THEATER UND MOTTOPARTYS','DISCOVERY & MUSEUMS':'ENTDECKUNGEN UND MUSEEN','COOKING & BAKING':'KOCHEN UND BACKEN','ADVENTURE & PUZZLES':'ABENTEUER UND RÄTSEL','OUTDOOR':'DRAUSSEN','AND THE BONUS OPTION…':'UND DIE BONUSOPTION…','THEME & FAMILY PARKS':'FREIZEIT- UND FAMILIENPARKS','INDOOR & WATER FUN':'INDOOR- UND WASSERSPASS','SCIENCE, TRANSPORT & DINOSAURS':'WISSENSCHAFT, VERKEHR UND DINOSAURIER','OUTDOOR ADVENTURE & NATURE':'ABENTEUER UND NATUR DRAUSSEN','FARM, CULTURE & OPEN-AIR MUSEUMS':'BAUERNHOF, KULTUR UND FREILICHTMUSEEN',
'24 Oct–8 Nov 2026':'24. Oktober–8. November 2026','· Petersplatz until 10 Nov':'· Petersplatz bis 10. November','Opening: 24 Oct, 12:00, Martinskirchplatz · Free entry; rides extra.':'Eröffnung: 24. Oktober, 12:00, Martinskirchplatz · Eintritt frei; Fahrgeschäfte kosten extra.','🎟️ Familienpass: 2–5 Nov 2026 · Discounts on participating rides for cardholders.':'🎟️ Familienpass: 2.–5. November 2026 · Ermässigungen bei teilnehmenden Fahrgeschäften für Karteninhaber.',
'Animal access · opening hours · activities: confirm with the farm before visiting.':'Tierzugang, Öffnungszeiten und Aktivitäten vor dem Besuch mit dem Hof abklären.',
'Autumn Day Trips':'Herbstausflüge','Farms':'Bauernhöfe','Your Home':'Bei euch zu Hause','Wherever you are':'Wo auch immer ihr seid','+ Fossil Hunting':'+ Fossiliensuche','~1h drive':'~1 Stunde Fahrt','Adventure Day':'Abenteuertag','OLD TOWN':'ALTSTADT'}
missing=set()
EMPTY_CHAPTERS={'things-to-do':'THINGS TO DO','family-life':'FAMILY LIFE','trips-outdoors':'TRIPS & OUTDOORS'}
for slug,title in EMPTY_CHAPTERS.items():
    for chapter in soup.select('details.guide-chapter'):
        summary=chapter.find('summary',recursive=False)
        if summary and title in summary.get_text(' ',strip=True):chapter['data-standalone-chapter']=slug;break
HEADINGS.update({'THINGS TO DO':'AKTIVITÄTEN','FAMILY LIFE':'FAMILIENLEBEN','TRIPS & OUTDOORS':'AUSFLÜGE UND NATUR','SOON':'BALD','Free Things to Do':'Kostenlose Aktivitäten','Classes & Activities':'Kurse und Aktivitäten','Holiday Camps (Tagesferien)':'Ferienangebote (Tagesferien)','Daycares (Kitas)':'Kindertagesstätten (Kitas)','Play Groups (Spielgruppen)':'Spielgruppen','Day Trips':'Tagesausflüge','Hiking with Stroller':'Wandern mit Kinderwagen'})

def fragment(selector,lang):
    original=soup.select_one(selector)
    if original is None: raise ValueError('Missing guide '+selector)
    if original.name!='details':
        parent=original.find_parent('details',class_='guide-subchapter')
        original=parent or original
    node=deepcopy(original)
    # Keep the original chapter summary and accordion structure.
    for bad in node.select('script,style'):bad.decompose()
    for comment in node.find_all(string=lambda s:isinstance(s,Comment)):comment.extract()
    if lang=='de':
        for el in node.select('[data-food-de],[data-evergreen-de]'):
            el.string=el.get('data-food-de') or el.get('data-evergreen-de')
        for el in node.select('.autumn-detail-line'):
            if el.has_attr('data-food-de') or el.has_attr('data-evergreen-de'):continue
            text=el.get_text(' ',strip=True)
            if text not in translations:missing.add(text)
            else:el.string=translations[text]
        for text in list(node.find_all(string=True)):
            if text.find_parent(class_='autumn-detail-line'):continue
            value=text.strip()
            if value in HEADINGS:text.replace_with(str(text).replace(value,HEADINGS[value]))
            elif text.find_parent(class_='autumn-name-cell'):
                updated=str(text)
                for en,de in HEADINGS.items():
                    if en in ['Your Home','Wherever you are','+ Fossil Hunting','~1h drive','Adventure Day','OLD TOWN','NEW']:updated=updated.replace(en,de)
                if updated!=str(text):text.replace_with(updated)
    if node.name=='details':node['open']=''
    # Recreate the ancestor chapter so every original CSS selector still applies.
    for ancestor in original.parents:
        if ancestor.get('id')=='guides-panel':break
        if ancestor.name=='details':
            wrapper=soup.new_tag('details',attrs=deepcopy(ancestor.attrs))
            wrapper['open']=''
            summary=ancestor.find('summary',recursive=False)
            if summary:wrapper.append(deepcopy(summary))
            wrapper.append(node);node=wrapper
    for details in node.select('details'):details['open']=''
    if lang=='de':
        for text in list(node.find_all(string=True)):
            value=text.strip()
            if value in HEADINGS:text.replace_with(str(text).replace(value,HEADINGS[value]))
    for el in node.find_all(True):
        for attr in list(el.attrs):
            if attr.startswith('on'):del el[attr]
        for attr in ['src','href']:
            url=el.get(attr,'')
            if url and not re.match(r'^(?:[a-z][a-z0-9+.-]*:|//|/|#)',url,re.I):el[attr]='../'+url.removeprefix('./')
    return str(node),len(original.select('article'))

CSS=(ROOT/'scripts/guide-source.css').read_text()
output={'guide-pages.css':CSS+'\n'}
urls=[]
manifest=[]

def path(item,lang):return '/'+item[0 if lang=='en' else 1]+'/'

def render(item,lang,content,description,indexable=True):
    slug=item[0 if lang=='en' else 1];title=item[2 if lang=='en' else 3];url=BASE+'/'+slug+'/'
    directory='/family-guides/' if lang=='en' else '/familienratgeber/'
    label='Family guides' if lang=='en' else 'Familienratgeber'
    note=('Please check the official listings for current prices, opening hours, age limits and booking requirements before visiting.' if lang=='en' else 'Bitte prüft vor dem Besuch die offiziellen Angaben zu Preisen, Öffnungszeiten, Altersgrenzen und Anmeldungen.')
    structured={'@context':'https://schema.org','@type':'CollectionPage','name':title,'description':description,'url':url,'inLanguage':lang,'isPartOf':{'@type':'WebSite','name':'GUGU Basel','url':BASE+'/'}}
    alternates=''.join(f'<link rel="alternate" hreflang="{l}" href="{BASE}{path(item,l)}">' for l in ['en','de'])
    document=f'''<!doctype html>
<html lang="{lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)} | GUGU Basel</title><meta name="description" content="{esc(description,quote=True)}">
<meta name="robots" content="{'index,follow' if indexable else 'noindex,follow'}"><link rel="canonical" href="{url}">{alternates}<link rel="alternate" hreflang="x-default" href="{BASE}{path(item,'en')}">
<meta property="og:type" content="website"><meta property="og:title" content="{esc(title,quote=True)} | GUGU Basel"><meta property="og:description" content="{esc(description,quote=True)}"><meta property="og:url" content="{url}"><meta property="og:image" content="{BASE}/favicon.PNG"><link rel="icon" href="../favicon.PNG"><link rel="stylesheet" href="../guide-pages.css">
<script type="application/ld+json">{json.dumps(structured,ensure_ascii=False).replace('<',chr(92)+'u003c')}</script></head>
<body><div class="shell"><header class="topbar"><a class="brand" href="../"><img src="../favicon.PNG" alt="">GUGU Basel</a><nav class="languages" aria-label="{'Language' if lang=='en' else 'Sprache'}"><a href="{path(item,'en')}" lang="en" hreflang="en"{' aria-current="page"' if lang=='en' else ''}>EN</a><a href="{path(item,'de')}" lang="de" hreflang="de"{' aria-current="page"' if lang=='de' else ''}>DE</a></nav></header>
<nav class="crumbs" aria-label="Breadcrumb"><a href="../">GUGU Basel</a> / <a href="{directory}">{label}</a> / {esc(title)}</nav>
<main><div class="intro"><p>{label} · Basel</p><h1>{esc(title)}</h1><p>{esc(description)}</p></div><section class="panel" id="guides-panel"><section class="family-guides"><div class="guide-accordion">{content}</div></section></section></main>
<footer class="footer"><p>{note}</p><p><a href="{directory}">{label}</a> · <a href="../">GUGU Basel</a> · <a href="https://www.instagram.com/gugubasel/">Instagram</a></p></footer></div></body></html>\n'''
    output[slug+'/index.html']=document
    if indexable:urls.append(url)
    manifest.append({'path':slug+'/index.html','language':lang,'indexable':indexable})

for guide in GUIDES:
    for lang in ['en','de']:
        body,count=fragment(guide[4],lang)
        desc=(f'{count} curated ideas for families: discover {guide[2].lower()}, with practical details, photos and official links.' if lang=='en' else f'{count} ausgewählte Tipps für Familien: {guide[3]} – mit praktischen Infos, Bildern und offiziellen Links.')
        if guide[0] in ['herbstmesse','herbstmesse-delicacies','halloween']:
            desc+=(' Edition: 2026; some dates may already have passed.' if lang=='en' else ' Ausgabe 2026; einzelne Termine können bereits vorbei sein.')
        render(guide,lang,body,desc)

def combine(guides,lang):
    result=BeautifulSoup('', 'html.parser')
    chapters={}
    for guide in guides:
        fragment_soup=BeautifulSoup(fragment(guide[4],lang)[0], 'html.parser')
        node=fragment_soup.find()
        summary=node.find('summary',recursive=False)
        key=summary.get_text(' ',strip=True) if summary else None
        if key and key in chapters:
            summary.decompose()
            for child in list(node.contents):chapters[key].append(child.extract())
        else:
            result.append(node)
            if key:chapters[key]=node
    return str(result)

def links(items,lang):
    return '<ul class="list">'+''.join(f'<li><a href="{path(g,lang)}">{esc(g[2 if lang=="en" else 3])}</a></li>' for g in items)+'</ul>'
for hub in HUBS:
    children=[g for g in GUIDES if g[5]==hub[0]]
    for lang in ['en','de']:
        desc=(f'Explore GUGU Basel’s {hub[2].lower()} guides.' if lang=='en' else f'Entdeckt die GUGU-Basel-Ratgeber: {hub[3]}.')
        content=combine(children,lang) if children else ('<p>This guide is being prepared. Explore the published family guides below.</p>' if lang=='en' else '<p>Dieser Ratgeber ist in Vorbereitung. Entdeckt unten unsere bereits veröffentlichten Familienratgeber.</p>')+links(GUIDES,lang)
        if not children:content=fragment('[data-standalone-chapter='+hub[0]+']',lang)[0]
        render(hub,lang,content,desc,bool(children))
DIRECTORY=('family-guides','familienratgeber','Family activities & guides in Basel','Familienaktivitäten und Ratgeber in Basel')
for lang in ['en','de']:
    content=combine(GUIDES,lang)
    content+=('<h2>All published guides</h2>' if lang=='en' else '<h2>Alle veröffentlichten Ratgeber</h2>')+links(GUIDES,lang)
    desc=('Plan family time in Basel: rainy-day ideas, cafés, brunch, birthday venues, farms, day trips and seasonal activities.' if lang=='en' else 'Familienzeit in Basel planen: Ideen für Regentage, Cafés, Brunch, Kindergeburtstage, Bauernhöfe, Ausflüge und saisonale Aktivitäten.')
    render(DIRECTORY,lang,content,desc)
if missing:raise ValueError('Add German translations to guide_de.json: '+repr(sorted(missing)))
# Only insert a small, crawlable navigation block. Do not reserialize the homepage.
block='<nav class="guide-links" aria-label="Family guides in English and German"><p><strong>Family Guides · Familienratgeber</strong></p><p><a href="/family-guides/">All guides (EN)</a> · <a href="/familienratgeber/" lang="de">Alle Ratgeber (DE)</a></p><ul>'+''.join(f'<li><a href="{path(g,"en")}">{esc(g[2])}</a> · <a lang="de" href="{path(g,"de")}">{esc(g[3])}</a></li>' for g in GUIDES)+'</ul></nav>'
start='<!-- STATIC GUIDE LINKS START -->';end='<!-- STATIC GUIDE LINKS END -->'
source=re.sub(re.escape(start)+r'.*?'+re.escape(end)+r'\n?','',source,flags=re.S)
anchor='<header class="guides-heading guides-heading-slogan">'
assert anchor in source
output['index.html']=source.replace(anchor,start+block+end+'\n'+anchor,1)
# Retain any other sitemap URLs when regenerating.
existing=re.findall(r'<loc>(.*?)</loc>',(ROOT/'sitemap.xml').read_text())
all_generated={BASE+'/'+m['path'].removesuffix('index.html') for m in manifest}
urls=list(dict.fromkeys([BASE+'/',*[u for u in existing if u not in all_generated],*urls]))
output['sitemap.xml']='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+''.join(f'  <url><loc>{esc(url)}</loc></url>\n' for url in urls)+'</urlset>\n'
output['scripts/guide_manifest.json']=json.dumps(manifest,ensure_ascii=False,indent=2)+'\n'
for name,text in output.items():
    target=ROOT/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(text)
print(f'Generated {len(manifest)} bilingual pages; {sum(m["indexable"] for m in manifest)} indexable; {len(urls)} sitemap URLs.')
