# Deploy State API to Render — Step by Step

**Total time:** ~20 minutes  
**Difficulty:** Easy (mostly clicking buttons)

---

## ✅ What I Already Did (Claude)

- ✅ Built and tested backend API
- ✅ Created Flask/FastAPI wrapper
- ✅ Set up database schema
- ✅ Created `.env.example` file
- ✅ Created deployment config

**You don't need to rebuild anything. Everything is ready.**

---

## 🔑 Your 5-Step Deployment Checklist

### Step 1: Get Your API Keys (YOU) — 5 min

You need two API keys. Get them fresh.

**Anthropic Claude:**
1. Go to https://console.anthropic.com/api/keys
2. Log in with your account
3. Click "Create key"
4. Copy the key (looks like: `sk-ant-api03-xxxxxxx...`)
5. **Save it somewhere safe** (password manager, text file, whatever)
6. ✅ Mark this done

**OpenAI (optional, but recommended as fallback):**
1. Go to https://platform.openai.com/api/keys
2. Log in
3. Click "+ Create new secret key"
4. Copy it (looks like: `sk-proj-xxxxxxx...`)
5. **Save it somewhere safe**
6. ✅ Mark this done

---

### Step 2: Create Render Account (YOU) — 3 min

1. Go to https://render.com
2. Click "Sign up"
3. Choose "Sign up with GitHub" (easiest)
4. Authorize Render to access GitHub
5. ✅ Mark this done

---

### Step 3: Push Code to GitHub (YOU) — 5 min

```bash
cd ~/your-ai-learning-repo

# Add all State API code
git add state-project-complete/
git add implementation-context-prototype/  # If you updated frontend

# Commit
git commit -m "Add State API backend + deployment config"

# Push
git push origin main
```

Wait for it to finish, then ✅ mark this done.

---

### Step 4: Deploy on Render (YOU) — 5 min

**On render.com dashboard:**

1. Click **"New +"** button (top right)
2. Select **"Web Service"**
3. Connect GitHub:
   - Click "Connect GitHub"
   - Authorize Render
   - Select `ai-learning` repo
   - Select branch: `main`
4. Configure service:
   - **Name:** `state-api` (or anything)
   - **Root Directory:** `state-project-complete/`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn api:app --host 0.0.0.0 --port $PORT`
5. Add environment variables:
   - Click "Add Environment Variable"
   - **Key:** `ANTHROPIC_API_KEY`
   - **Value:** [Paste your Anthropic key from Step 1]
   - Click "Add Environment Variable" again
   - **Key:** `OPENAI_API_KEY`
   - **Value:** [Paste your OpenAI key from Step 1]
6. Click **"Create Web Service"**

**Wait 3-5 minutes for deployment.**

Render will show logs. When you see:
```
Uvicorn running on http://0.0.0.0:PORT
```

You're live! ✅ Mark this done.

---

### Step 5: Copy Your API URL (YOU) — 1 min

After deployment finishes:

1. Look at the top of the Render dashboard
2. You'll see your service name with a URL like:
   ```
   https://state-api-xxxxx.render.com
   ```
3. **Copy this URL**
4. Keep it handy — you'll need it next
5. ✅ Mark this done

---

## Test It (YOU) — 2 min

### Test your API is live:

```bash
# Replace YOUR-URL with the URL from Step 5
curl https://your-url/health

# Should return:
# {"status":"ok"}
```

If you get that back, your API is working! ✅

---

## Update Frontend (YOU) — 3 min

**Edit** `implementation-context-prototype/index.html`:

Find this line (around line 150):
```javascript
const API_URL = 'http://localhost:8000';
```

Change it to:
```javascript
const API_URL = 'https://state-api-xxxxx.render.com';
```

(Use your actual URL from Step 5)

Then:
```bash
git add implementation-context-prototype/
git commit -m "Update frontend to call deployed API"
git push
```

Your Vercel site auto-deploys. Wait ~30 seconds.

---

## Final Test (YOU) — 2 min

1. Go to https://ai-learning-rouge.vercel.app/implementation-context-prototype
2. Click **"+ Add project update"**
3. Submit:
   ```
   We moved the AI Pilot launch to October 15 because security review needs more time.
   ```
4. Wait 3-5 seconds for AI analysis
5. You should see a Review appear with AI interpretation

**If it works: 🎉 You're live!**

**If it fails:**
- Check Render logs: https://dashboard.render.com → Your service → Logs
- Verify your API URL is correct in index.html
- Check keys are set correctly in Render dashboard

---

## Cost

- **Render free tier:** 750 free dyno hours/month = 24/7 operation
- **API calls:** ~$0.02-0.05 per interpretation (Claude or GPT-4)
- **Estimated monthly:** Free to $10

---

## You're Done!

Your system is now:
- ✅ Frontend: https://ai-learning-rouge.vercel.app
- ✅ Backend: https://state-api-xxxxx.render.com
- ✅ Database: SQLite (lives on Render)
- ✅ Live and working

Users can submit evidence, get AI analysis, and accept/reject proposals.

---

## Questions?

- **API won't start:** Check Render logs for errors
- **CORS errors:** Make sure your frontend URL is in CORS_ORIGINS
- **"API error" in dialog:** Keys might be wrong or API isn't running
- **Slow first request:** Cold start is normal (3-5s first time, 2-3s after)

---

## Optional Next Steps

After everything is working:

1. **Monitor costs** — Check Render/OpenAI usage
2. **Add logging** — Add request logging to api.py
3. **Test more** — Try different evidence types
4. **Migrate database** — Move from SQLite to PostgreSQL (Render has free tier)
5. **Write case study** — Document the entire build for your portfolio

---

**You've got this. Let me know if you get stuck.** 🚀
