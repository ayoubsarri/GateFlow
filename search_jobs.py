import urllib.request
import urllib.parse
import json

def search_euraxess(query):
    url = f"https://euraxess.ec.europa.eu/jobs/search/api?keywords={urllib.parse.quote(query)}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        response = urllib.request.urlopen(req)
        data = json.loads(response.read().decode('utf-8'))
        return data
    except Exception as e:
        print("Euraxess error:", e)
        return None

print(search_euraxess("forest ecology"))
