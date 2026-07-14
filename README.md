# Lantern Camp Guest Access Portal

This repository contains the standalone, guest-facing check-in and waiver signature portal for Lantern Camp (Orland, Maine).

Guests receive a personalized, obfuscated URL (e.g. `https://checkin.lanterncamp.com/a7B2xD`) via Airbnb messaging. When they check in, they review the terms, provide their email, agree to the liability waiver, and receive their static cabin door code. Their signature is instantly logged to your Google Drive.

---

## 📂 Project Architecture & Files

This is a unified Vercel project hosting both the static UI frontend and the serverless Node.js backend under one domain.

*   `index.html` — The guest-facing check-in page. Fits the Lantern Camp brand (Deep Forest Green base, Warm Linen background, editorial serifs, responsive layout).
*   `vercel.json` — Custom routing rules. Automatically redirects short paths (`/:token` of 6 characters) to `/index.html?t=:token`.
*   `package.json` — Declares Node.js project options.
*   `server.js` — Self-contained local HTTP development server for local testing. Runs at `http://localhost:3000`.
*   `api/checkin.js` — Vercel Serverless Function handling API requests:
    *   `GET /api/checkin?token=TOKEN`: Retrieves the cabin details (Name & Type) to show the welcome screen. Hides the door code.
    *   `POST /api/checkin`: Logs the signature row to Google Drive and returns the cabin door code.
*   `api/config/cabins.json` — The token-to-cabin mapping ledger.
*   `token.json` — Local Google OAuth token file (ignored by Git) used for credentials during local testing.

---

## 🔑 Obfuscated Cabin Tokens & Door Codes

The cabin mapping is configured inside `api/config/cabins.json` using the layout rules (Cabin 1 Accessible, 2-12 Field, 13-24 Forest):

| Cabin Name | Token | Check-in URL Path | Static Door Code |
| :--- | :--- | :--- | :--- |
| **Field Cabin 1 (Accessible)** | `w9W2aH` | `/w9W2aH` | `1001#` |
| **Field Cabin 2** | `x5X6bJ` | `/x5X6bJ` | `1002#` |
| **Field Cabin 3** | `y1Y8cK` | `/y1Y8cK` | `1003#` |
| **Field Cabin 4** | `z6Z4dL` | `/z6Z4dL` | `1004#` |
| **Field Cabin 5** | `b2A8eM` | `/b2A8eM` | `1005#` |
| **Field Cabin 6** | `d7B3fN` | `/d7B3fN` | `1006#` |
| **Field Cabin 7** | `f3C8gP` | `/f3C8gP` | `1007#` |
| **Field Cabin 8** | `h8D4hQ` | `/h8D4hQ` | `1008#` |
| **Field Cabin 9** | `j9E2jR` | `/j9E2jR` | `1009#` |
| **Field Cabin 10** | `k5F7kS` | `/k5F7kS` | `1010#` |
| **Field Cabin 11** | `m2G8mT` | `/m2G8mT` | `1011#` |
| **Field Cabin 12** | `n6H4nV` | `/n6H4nV` | `1012#` |
| **Forest Cabin 13** | `a7B2xD` | `/a7B2xD` | `1301#` |
| **Forest Cabin 14** | `c3F9qZ` | `/c3F9qZ` | `1402#` |
| **Forest Cabin 15** | `e8K1wY` | `/e8K1wY` | `1503#` |
| **Forest Cabin 16** | `g4V6pX` | `/g4V6pX` | `1604#` |
| **Forest Cabin 17** | `j9M2rL` | `/j9M2rL` | `1705#` |
| **Forest Cabin 18** | `k5N7sT` | `/k5N7sT` | `1806#` |
| **Forest Cabin 19** | `m2P8uB` | `/m2P8uB` | `1907#` |
| **Forest Cabin 20** | `n6Q4vC` | `/n6Q4vC` | `2008#` |
| **Forest Cabin 21** | `p1R9wD` | `/p1R9wD` | `2109#` |
| **Forest Cabin 22** | `r7S3xE` | `/r7S3xE` | `2210#` |
| **Forest Cabin 23** | `t3T8yF` | `/t3T8yF` | `2311#` |
| **Forest Cabin 24** | `v8U4zG` | `/v8U4zG` | `2412#` |

---

## 📝 Signature Log Location (Google Drive)

*   Signatures are appended directly to **`Lantern Camp - Guest Waiver Signatures.csv`** (File ID: `1u6W61FoL9Ux3ZfzvBHGsTV9LyI0sPhu6`) in your Google Drive folder.
*   The data logged includes: `[Timestamp, Token, Cabin Name, Email, Agreed=TRUE, MarketingOptIn]`.

---

## 🚀 Running and Deploying

### Local Development
To run this project locally:
1. Make sure `token.json` exists in the root folder (copied from `task-manager`).
2. Run `node server.js` from this folder.
3. Open `http://localhost:3000/a7B2xD` in your browser.

### Vercel Deployment
To deploy this project to production:
1. Initialize a Git repository here and push it to a new GitHub repo.
2. Link it in **Vercel** as a new project.
3. Add an Environment Variable in Vercel settings:
    *   **Key:** `GOOGLE_TOKEN_JSON`
    *   **Value:** Paste the entire text content of `token.json`.
4. Point your subdomain `checkin.lanterncamp.com` to Vercel (via CNAME record pointing to `cname.vercel-dns.com` in your DNS registrar).
