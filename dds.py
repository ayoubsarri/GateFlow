import urllib.request
import urllib.parse
from bs4 import BeautifulSoup

def search_ddg(query):
    url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        html = urllib.request.urlopen(req).read()
        soup = BeautifulSoup(html, 'html.parser')
        for a in soup.find_all('a', class_='result__url'):
            print(a.get('href'))
    except Exception as e:
        print(e)

search_ddg("PhD position forest ecology 2024 Germany")
