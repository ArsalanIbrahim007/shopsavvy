# Backups: what is safe, and what to copy off this PC

| What | Where it lives | Backed up how |
|---|---|---|
| Code: scrapers, API, website, scripts, reports | GitHub (`main`, `arsalan`) | every push |
| Database: listings, price histories, alerts, usability answers | local MongoDB on this PC | **every night** after the scrape, to `D:\ShopSavvy-backups\<date-time>\`, the newest 7 kept; or by hand: `node src/scripts/ops/backup-database.js` |
| Settings and passwords: `backend\.env` | this PC only (never in git) | **by hand**, privately (below) |

A backup is about 15 MB (157 MB of data, compressed). A backup on the same disk does not survive that disk, so copy it off the PC.

## Off this PC, automatically (recommended)

1. Install **Google Drive for desktop** and sign in. It shows your Drive as a drive letter, for example `G:\My Drive`.
2. Create the folder `G:\My Drive\ShopSavvy-backups`.
3. Add this line to `backend\.env`:
   ```
   BACKUP_DIR=G:\My Drive\ShopSavvy-backups
   ```
   Every night's backup is then written straight into Drive and uploaded. Drive's free 15 GB holds the 7 kept backups many times over.

Without Drive: copy the newest folder from `D:\ShopSavvy-backups` to a USB stick or any cloud storage once or twice a week.

## The settings file

`backend\.env` holds the database address, the email password and the admin key. Keep one copy somewhere private that is not
this PC and not GitHub: a private folder in your Drive, or your password manager. Without it, a restored database still needs
these settings typed in again.

## Restoring (a new PC, or after a failed disk)

1. Install Node.js 24 and MongoDB Community Server, and clone the repository from GitHub.
2. `cd backend` then `npm install` (it also installs the scrapers' browser).
3. Put your saved `.env` back in `backend\`.
4. Load the newest backup:
   ```
   node src/scripts/ops/restore-database.js "G:\My Drive\ShopSavvy-backups\2026-11-15-22-30"
   ```
   It refuses to overwrite a database that already holds data unless you add `--replace`, and it checks every collection's count
   against the backup's manifest. A restore can also go straight to MongoDB Atlas: give the Atlas address as a second argument.
5. Start the API (`node src/app.js`) and register the nightly scrape again (`src/scripts/ops/register-nightly-scrape.ps1`).

Checked on 2026-11-15: a backup restored into a separate test database gave every document back (77,788 listings, 77,791 price
histories), the first of each identical to the live one, ids and dates with their types.
