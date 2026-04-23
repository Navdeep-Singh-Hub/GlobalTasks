# Deployment Guide (Render + Vercel)

This setup deploys:
- Backend API on **Render**
- Frontend Next.js app on **Vercel**

## 1) Deploy Backend on Render

Use the included `render.yaml` from the repo root.

### Steps
1. Push this repository to GitHub.
2. In Render, choose **New +** -> **Blueprint**.
3. Select this repository.
4. Render reads `render.yaml` and creates `globaltasks-api`.
5. Set required secret env vars in Render:
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `CLIENT_ORIGIN` = your Vercel frontend URL (for example `https://your-app.vercel.app`)
   - optional: `CLIENT_ORIGINS` comma-separated list (preview URLs, local URL)

After deploy, copy your Render API URL:
- Example: `https://globaltasks-api.onrender.com`

Health check:
- `https://globaltasks-api.onrender.com/api/health`

## 2) Deploy Frontend on Vercel

The frontend is in the `frontend` folder.

### Steps
1. In Vercel, import this repo.
2. Set **Root Directory** to `frontend`.
3. Keep framework as Next.js.
4. Add environment variable:
   - `NEXT_PUBLIC_API_URL` = `https://<your-render-domain>/api` (recommended)
   - If you accidentally set `https://<your-render-domain>` (missing `/api`), the frontend will try to auto-fix, but you should still standardize on `/api`.
5. Deploy.

If Vercel still asks for wrong output directory, ensure Project Setting:
- Output Directory = empty/default (or `.next`)
- Not `public`

## 3) CORS Notes

Backend supports:
- `CLIENT_ORIGIN` (single URL)
- `CLIENT_ORIGINS` (comma-separated URLs)

Set these to include:
- Vercel production domain
- Optional Vercel preview domain(s)
- Optional localhost for testing
