"""Bots ke repo me use karo. Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, GH_PAT.
Usage: from notify import notify; notify("Video upload ho gaya")"""
import os, json, urllib.request, urllib.parse

DASHBOARD_REPO = "bgsarkariresult/BG-Automation"


def notify(text):
    # 1) Telegram par bhejo
    url = "https://api.telegram.org/bot%s/sendMessage" % os.environ["TELEGRAM_BOT_TOKEN"]
    data = urllib.parse.urlencode({"chat_id": os.environ["TELEGRAM_CHAT_ID"], "text": text}).encode()
    urllib.request.urlopen(url, data, timeout=30)
    # 2) Website par dikhane ke liye dashboard repo ko event bhejo
    req = urllib.request.Request(
        "https://api.github.com/repos/%s/dispatches" % DASHBOARD_REPO,
        json.dumps({"event_type": "tg-message", "client_payload": {"text": text}}).encode(),
        {"Authorization": "Bearer " + os.environ["GH_PAT"], "Accept": "application/vnd.github+json"},
    )
    urllib.request.urlopen(req, timeout=30)
