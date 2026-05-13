#!/usr/bin/env python3
"""Creates the O365 Events dashboard in OpenSearch Dashboards."""
import json
import sys
import urllib.request
import urllib.error

BASE_URL = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://192.168.0.103:30561"
HEADERS = {"osd-xsrf": "true", "Content-Type": "application/json"}
INDEX = "o365-events"
INDEX_PATTERN_ID = "o365-events"

EVENT_TYPES = [
    "AADSignin",
    "ActivityLog",
    "AdminConsentGranted",
    "AnonymousIPSignIn",
    "BulkSharePointDownload",
    "DataExfiltrationAlert",
    "Diagnostic",
    "ExternalForwardingRuleCreated",
    "GuestAccountAdded",
    "ImpossibleTravel",
    "MailboxPermissionGranted",
    "MassMailboxDeletion",
    "MFADisabledForUser",
    "OAuthAppConsentGrant",
    "OutlookAdmin",
    "OutlookCalendar",
    "OutlookMail",
    "PasswordSpray",
    "RiskyUserDetected",
    "SecurityAlert",
    "SuspiciousInboxRule",
    "SuspiciousSignIn",
]


def api(method, path, body=None):
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def create_index_pattern():
    status, resp = api(
        "POST",
        f"/api/saved_objects/index-pattern/{INDEX_PATTERN_ID}",
        {"attributes": {"title": INDEX, "timeFieldName": "CreationTime"}},
    )
    label = "created" if status in (200, 201) else f"skipped ({resp.get('message', status)})"
    print(f"  Index pattern '{INDEX}': {label}")


def create_metric_viz(event_type):
    viz_id = f"metric-{event_type}"
    vis_state = {
        "title": event_type,
        "type": "metric",
        "params": {
            "addTooltip": True,
            "addLegend": False,
            "type": "metric",
            "metric": {
                "percentageMode": False,
                "useRanges": False,
                "colorSchema": "Green to Red",
                "metricColorMode": "None",
                "colorsRange": [{"from": 0, "to": 10000}],
                "labels": {"show": True},
                "invertColors": False,
                "style": {
                    "bgFill": "#000",
                    "bgColor": False,
                    "labelColor": False,
                    "subText": "",
                    "fontSize": 60,
                },
            },
        },
        "aggs": [{"id": "1", "enabled": True, "type": "count", "schema": "metric", "params": {}}],
    }
    search_source = {
        "index": INDEX_PATTERN_ID,
        "query": {"query": f'eventType:"{event_type}"', "language": "kuery"},
        "filter": [],
    }
    body = {
        "attributes": {
            "title": event_type,
            "visState": json.dumps(vis_state),
            "uiStateJSON": "{}",
            "description": "",
            "version": 1,
            "kibanaSavedObjectMeta": {"searchSourceJSON": json.dumps(search_source)},
        }
    }
    status, resp = api("POST", f"/api/saved_objects/visualization/{viz_id}", body)
    label = "created" if status in (200, 201) else f"skipped ({resp.get('message', status)})"
    print(f"  Viz '{event_type}': {label}")
    return viz_id


def create_dashboard(viz_ids):
    COLS, W, H = 4, 12, 8
    panels, references = [], []
    for i, viz_id in enumerate(viz_ids):
        col, row = i % COLS, i // COLS
        idx = str(i)
        panels.append({
            "version": "2.19.1",
            "type": "visualization",
            "gridData": {"x": col * W, "y": row * H, "w": W, "h": H, "i": idx},
            "panelIndex": idx,
            "embeddableConfig": {},
            "panelRefName": f"panel_{i}",
        })
        references.append({"name": f"panel_{i}", "type": "visualization", "id": viz_id})

    body = {
        "attributes": {
            "title": "O365 Events",
            "hits": 0,
            "description": "Event counts by type",
            "panelsJSON": json.dumps(panels),
            "optionsJSON": json.dumps({"useMargins": True, "hidePanelTitles": False}),
            "version": 1,
            "timeRestore": False,
            "kibanaSavedObjectMeta": {
                "searchSourceJSON": json.dumps({"query": {"query": "", "language": "kuery"}, "filter": []})
            },
        },
        "references": references,
    }
    status, resp = api("POST", "/api/saved_objects/dashboard/o365-events-dashboard", body)
    label = "created" if status in (200, 201) else f"failed ({resp.get('message', status)})"
    print(f"  Dashboard 'O365 Events': {label}")


print(f"Target: {BASE_URL}\n")
print("Creating index pattern...")
create_index_pattern()

print("\nCreating metric visualizations...")
viz_ids = [create_metric_viz(et) for et in EVENT_TYPES]

print("\nCreating dashboard...")
create_dashboard(viz_ids)

print(f"\nDone. Open: {BASE_URL}/app/dashboards#/view/o365-events-dashboard")
