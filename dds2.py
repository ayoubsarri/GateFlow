import urllib.request
import urllib.parse
from bs4 import BeautifulSoup
import re

def search_ddg_html(query):
    url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'})
        html = urllib.request.urlopen(req).read()
        soup = BeautifulSoup(html, 'html.parser')

        for a in soup.find_all('a', class_='result__snippet'):
            title_node = a.find_previous_sibling('h2', class_='result__title')
            title = title_node.text.strip() if title_node else a.get('href')
            print(f"Title: {title}")
            print(f"URL: {a.get('href')}")
            print(f"Snippet: {a.text.strip()}")
            print("-" * 20)
    except Exception as e:
        print(e)

search_ddg_html('site:academicpositions.com "PhD" "forest ecology" OR "biodiversity"')
print("="*30)
search_ddg_html('site:jobs.sciencecareers.org "PhD" "forest ecology" OR "biodiversity"')
print("="*30)
search_ddg_html('site:euraxess.ec.europa.eu "phd" "forest" OR "biodiversity"')
