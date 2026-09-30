import urllib.request
import urllib.parse
from bs4 import BeautifulSoup
import re

def search_nature():
    url = "https://www.nature.com/naturecareers/jobs/ecology-and-evolution"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        html = urllib.request.urlopen(req).read()
        soup = BeautifulSoup(html, 'html.parser')
        jobs = []
        for h3 in soup.find_all('h3', class_='c-job-title'):
            a = h3.find('a')
            if a:
                title = a.text.strip()
                link = "https://www.nature.com" + a['href']
                jobs.append((title, link))
        for title, link in jobs[:10]:
            print(f"{title}: {link}")
    except Exception as e:
        print("Nature Error:", e)

search_nature()
