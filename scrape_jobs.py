import urllib.request
import urllib.parse
from bs4 import BeautifulSoup
import re

def scrape_earthworks():
    url = "https://www.earthworks-jobs.com/ecology.html"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        html = urllib.request.urlopen(req).read()
        soup = BeautifulSoup(html, 'html.parser')
        links = []
        for a in soup.find_all('a', href=True):
            if 'ecology' in a['href'] or 'forest' in a['href'] or 'phd' in a.text.lower():
                links.append((a.text.strip(), "https://www.earthworks-jobs.com/" + a['href']))
        for title, link in links[:15]:
            if len(title) > 5:
                print(f"{title}: {link}")
    except Exception as e:
        print("Earthworks Error:", e)

scrape_earthworks()
