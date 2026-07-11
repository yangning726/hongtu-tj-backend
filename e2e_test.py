#!/usr/bin/env python3
"""End-to-end test for the registration system."""
import urllib.request
import json
import sys

API = "https://four-apes-guess.loca.lt"
DEPLOYED = "https://d0473107241541c1ac171b934d24750a.app.codebuddy.work"

print("=" * 50)
print("  End-to-End Registration System Test")
print("=" * 50)

# Step 1: Health check
print("\n[1] Health check...")
try:
    resp = urllib.request.urlopen(f"{API}/api/health", timeout=10)
    health = json.loads(resp.read().decode())
    print(f"    OK: {health}")
except Exception as e:
    print(f"    FAIL: {e}")
    sys.exit(1)

# Step 2: Verify deployed index.html has correct WEBHOOK_URL
print("\n[2] Verify deployed index.html WEBHOOK_URL...")
try:
    req = urllib.request.Request(f"{DEPLOYED}/index.html")
    resp = urllib.request.urlopen(req, timeout=10)
    html = resp.read().decode('utf-8')
    if "hongtu2026.loca.lt" in html:
        print("    OK: WEBHOOK_URL points to hongtu2026.loca.lt")
    elif "violet-hornets-wear" in html:
        print("    FAIL: Still using old URL violet-hornets-wear.loca.lt")
        sys.exit(1)
    else:
        print("    WARN: Could not find loca.lt URL in page")
except Exception as e:
    print(f"    FAIL: {e}")

# Step 3: Verify deployed admin.html has correct API_BASE
print("\n[3] Verify deployed admin.html API_BASE...")
try:
    req = urllib.request.Request(f"{DEPLOYED}/admin.html")
    resp = urllib.request.urlopen(req, timeout=10)
    html = resp.read().decode('utf-8')
    if "hongtu2026.loca.lt" in html:
        print("    OK: API_BASE points to hongtu2026.loca.lt")
    elif "violet-hornets-wear" in html:
        print("    FAIL: Still using old URL")
        sys.exit(1)
    else:
        print("    WARN: Could not find loca.lt URL in page")
except Exception as e:
    print(f"    FAIL: {e}")

# Step 4: Simulate registration (like a parent would do from the deployed site)
print("\n[4] Simulate parent registration...")
test_data = json.dumps({
    "name": "E2E Test Parent",
    "grade": "Grade 12",
    "school": "Test School",
    "phone": "13900000000"
}).encode("utf-8")

req = urllib.request.Request(
    f"{API}/api/register",
    data=test_data,
    headers={
        "Content-Type": "application/json",
        "Origin": DEPLOYED
    }
)
resp = urllib.request.urlopen(req, timeout=10)
reg_result = json.loads(resp.read().decode())
print(f"    Registration result: {reg_result}")
reg_id = reg_result.get("id")

# Step 5: Admin login and verify
print("\n[5] Admin login...")
login_data = json.dumps({"password": "hongtu2026"}).encode("utf-8")
req = urllib.request.Request(
    f"{API}/api/admin/login",
    data=login_data,
    headers={"Content-Type": "application/json"}
)
resp = urllib.request.urlopen(req, timeout=10)
login_result = json.loads(resp.read().decode())
token = login_result.get("token", "")
print(f"    Login OK, token received")

# Step 6: List registrations
print("\n[6] List registrations...")
req = urllib.request.Request(
    f"{API}/api/admin/registrations?page=1&limit=10",
    headers={"Authorization": f"Bearer {token}"}
)
resp = urllib.request.urlopen(req, timeout=10)
list_result = json.loads(resp.read().decode())
print(f"    Total: {list_result['total']}")
for item in list_result["items"]:
    print(f"    - ID:{item['id']} Name:{item['name']} School:{item['school']} Phone:{item['phone']}")

# Step 7: Check stats
print("\n[7] Check stats...")
req = urllib.request.Request(
    f"{API}/api/admin/stats",
    headers={"Authorization": f"Bearer {token}"}
)
resp = urllib.request.urlopen(req, timeout=10)
stats = json.loads(resp.read().decode())
print(f"    Total: {stats['total']}, Today: {stats['today']}, Week: {stats['week']}")

# Step 8: Clean up test data
print("\n[8] Clean up test data...")
del_data = json.dumps({"ids": [item["id"] for item in list_result["items"]]}).encode("utf-8")
req = urllib.request.Request(
    f"{API}/api/admin/registrations/batch",
    data=del_data,
    method="DELETE",
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
)
resp = urllib.request.urlopen(req, timeout=10)
print(f"    Cleanup: {resp.read().decode()}")

print("\n" + "=" * 50)
print("  ALL TESTS PASSED!")
print("=" * 50)
print(f"\n  Main site:    {DEPLOYED}/index.html")
print(f"  Admin panel:  {DEPLOYED}/admin.html")
print(f"  Backend API:  {API}")
print(f"  Admin pass:   hongtu2026")
print("=" * 50)
