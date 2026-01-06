
import urllib.request
import ssl
import re

def get_github_contributions(username):
    # Try the specific contributions partial
    url = f"https://github.com/users/{username}/contributions"
    print(f"Fetching {url}...")
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
            html = response.read().decode('utf-8')
            
            # Simple debug search
            indices = [m.start() for m in re.finditer('contributions', html)]
            for idx in indices:
                start = max(0, idx - 50)
                end = min(len(html), idx + 50)
                print(f"Generic Match context: ...{html[start:end]}...")

            patterns = [
                r'([\d,]+)\s+contributions\s+in\s+the\s+last\s+year',
                r'([\d,]+)\s+contributions\s+in\s+\d{4}'
            ]
            
            for p in patterns:
                match = re.search(p, html)
                if match:
                    print(f"REGEX MATCH: {match.group(0)}")
                    count_str = match.group(1).replace(',', '')
                    return int(count_str)
            print("No regex match found.")
            return None
    except Exception as e:
        print(f"Error: {e}")
        return None


print(f"Count Addressmehari: {get_github_contributions('Addressmehari')}")
print(f"Count Torvalds: {get_github_contributions('torvalds')}")
