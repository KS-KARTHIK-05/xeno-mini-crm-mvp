import sys, json
import urllib.request

payload = json.dumps({
    'message': 'Find VIP customers who spent over 10000 rupees and send them a WhatsApp loyalty reward message'
}).encode()

req = urllib.request.Request(
    'http://localhost:8000/api/copilot/chat',
    data=payload,
    headers={'Content-Type': 'application/json'}
)

print("Sending to copilot...")
try:
    r = urllib.request.urlopen(req, timeout=40)
    data = json.loads(r.read())
    print("\n=== COPILOT RESPONSE ===")
    print("Type:", data['type'])
    print("\nText:", data['text'])
    if data.get('segment_preview'):
        sp = data['segment_preview']
        print("\nSegment count:", sp['count'])
        print("SQL:", sp['sql_preview'])
        if sp.get('sample_customers'):
            print("Sample customer:", sp['sample_customers'][0]['name'], "-", sp['sample_customers'][0]['city'])
    if data.get('campaign_data'):
        print("\nCampaign data:", json.dumps(data['campaign_data'], indent=2))
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code)
    print(e.read().decode())
except Exception as e:
    print("Error:", e)
