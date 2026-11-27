# 📝 BG Title Updater

कम चलने वाले YouTube वीडियो के title/description के सुझाव बनाता है। आपके **Approve** के बाद ही बदलता है।
Dashboard: https://bgsarkariresult.github.io/BG-Automation/title-updater.html

## 💡 सुझाव mode (अभी चालू: `"mode": "suggest"`)
OAuth token की ज़रूरत नहीं। Bot YouTube पर **कुछ नहीं बदलता**।
- Secrets: `YT_API_KEY`, कम से कम एक `GEMINI_API_KEY_1` (या `GROQ_API_KEY`)। Telegram वैकल्पिक।
- `config.json` में हर चैनल का `youtube` (जैसे `@SGNews18` या `UC...` ID)। खाली हो तो चैनल छोड़ा जाता है।
- Dashboard से title/description copy करें, **Studio में बदलें**, फिर **मैंने लगा दिया → फ़ैसले भेजें**।
  न दबाएँ तब भी, सुझाव pending रहते, अगला scan बदला हुआ title पहचान लेता है।
- Undo: History से पुराना title/description copy करके Studio में लगाएँ।
- सिर्फ़ Public वीडियो दिखते हैं।
- `old_video_days` (60) से पुराने कम views वाले वीडियो के सुझाव निगरानी से पहले ही आते हैं, सबसे पुराने पहले।
  बाकी के लिए `observe_days` (2) दिन views देखे जाते हैं।

नीचे के step 1-3 सिर्फ़ `"mode": "auto"` के लिए हैं।

## 1. Google Cloud (एक बार)
1. console.cloud.google.com पर project चुनें और **YouTube Data API v3** चालू करें।
2. OAuth consent screen भरें और Publishing status **In production** करें।
   (Testing में refresh token 7 दिन में बंद हो जाता है।)
3. Credentials → Create **OAuth client ID** → type **Web application**.
   Authorized redirect URI: `https://developers.google.com/oauthplayground`

## 2. हर चैनल का refresh token (मोबाइल से भी)
1. https://developers.google.com/oauthplayground खोलें।
2. ⚙️ → **Use your own OAuth credentials** → Client ID और Secret डालें।
3. Scope बॉक्स में डालें: `https://www.googleapis.com/auth/youtube.force-ssl` → **Authorize APIs**.
4. उसी चैनल का Google account / brand channel चुनें।
5. **Exchange authorization code for tokens** → **Refresh token** कॉपी करें।

यह token चैनल पर पूरा नियंत्रण देता है। इसे सिर्फ़ GitHub Secrets में रखें।

## 3. GitHub Secrets (BG-Automation → Settings → Secrets → Actions)
| Secret | क्या है |
|---|---|
| `YT_UPDATER_CLIENT_ID`, `YT_UPDATER_CLIENT_SECRET` | ऊपर वाला OAuth client |
| `YT_REFRESH_TOKEN_1` | SG News24 |
| `YT_REFRESH_TOKEN_2` | BGCraters |
| `YT_REFRESH_TOKEN_3` | BK GrowUp |
| `YT_REFRESH_TOKEN_4` | History Facts |
| `YT_REFRESH_TOKEN_5` | Podcast |
| `GEMINI_API_KEY_1` से `_3`, `GROQ_API_KEY` | AI |
| `UPDATER_BOT_TOKEN` | **नया अलग** Telegram bot (बटन के लिए); उसे एक बार /start भेजें |
| `TELEGRAM_CHAT_ID` | आपकी chat ID |

शुरुआत में सिर्फ़ `YT_REFRESH_TOKEN_1` डालें। जिस चैनल का token नहीं है वह छोड़ दिया जाता है।
`UPDATER_BOT_TOKEN` न हो तो `TELEGRAM_BOT_TOKEN` से सिर्फ़ संदेश आएँगे, बटन नहीं।

## 4. चलाना
- Dashboard पर **अभी Scan करें**, या Actions → BG Title Updater → Run (action = `scan`)।
- auto mode में पहले `observe_days` दिन **सिर्फ़ views की निगरानी** होती है, उसके बाद सुझाव आते हैं।
- Telegram बटन अगले run में लागू होते हैं (घंटे में एक बार तय है; GitHub देर भी कर सकता है)।
- Dashboard पर फ़ैसले चुनें, फिर **फ़ैसले भेजें** दबाएँ।
- शुरू में `config.json` में `"dry_run": true` है। सुझाव ठीक लगें तो `false` करें।

## वीडियो कब "कमज़ोर" माना जाता है (config.json → rules)
ये सभी बातें हों: 14 दिन से पुराना, कुल views 500 से कम, औसत 5 views/दिन से कम,
और देखे गए हाल के दिनों में रोज़ 2 views या उससे कम।

## ध्यान दें
- सिर्फ़ **Public** वीडियो देखे जाते हैं। `include_unlisted: true` करने पर unlisted वीडियो के link
  इस **public repo** की `data/title_updater.json` में सबको दिखेंगे।
- पुरानी description पूरी रहती है; नया intro और hashtags जुड़ते हैं।
- Thumbnail अपने आप नहीं बदलता, सिर्फ़ सुझाव मिलता है।
- Dashboard के बटन आपके Cloudflare Worker से चलते हैं। Worker पर **PIN** ज़रूर चालू रखें,
  वरना कोई भी Approve/Undo भेज सकता है।
- कभी न छेड़ने वाले वीडियो: dashboard पर 🛡 या `protected_videos` में link डालें।
