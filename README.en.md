# UNETI Schedule Widget

A desktop app for UNETI students to check class schedules quickly and conveniently.

[![Version](https://img.shields.io/badge/version-1.5.0-blue.svg)](https://github.com/hoaug-tran/uneti-schedule-app)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)](https://github.com/hoaug-tran/uneti-schedule-app)

---

## Introduction

I built this app to make checking UNETI schedules easier. Instead of opening a browser and logging into the school's schedule page every time, you can just click the tray icon.

The app auto-refreshes schedules every hour, so your schedule is always up to date.

## Main Features

- Display weekly class schedule
- Auto-refresh: current week every 1 hour, next week every 6 hours
- Works offline (uses cached schedule)
- Dark/Light theme
- Vietnamese/English
- Tray icon for quick access

## Installation

### Requirements

- Windows 10/11 (64-bit)
- About 150MB disk space

### How to Install

1. Download `.exe` file from [Releases](https://github.com/hoaug-tran/uneti-schedule-app/releases)
2. Run installer
3. Open app and login with UNETI account

> [!IMPORTANT]
> Internet required for first login. After that, app works offline.

## Usage

### Login

First time opening the app will show login window. Enter your UNETI username/password as usual.

> [!NOTE]
> App only stores encrypted session cookies on your computer, not your password.

### View Schedule

After login, schedule will auto-display. Use "← Previous" and "Next →" buttons to navigate weeks.

### Refresh Schedule

Click "Refresh" button to load latest schedule from server. You should refresh before important dates (exams, project deadlines...).

> [!TIP]
> App auto-refreshes every hour, but you should manually refresh before exam days to be sure.

### Tray Menu

Right-click tray icon to open menu:

- **Start with Windows**: Auto-run on computer startup
- **Clear Schedule Data**: Delete cached schedules (use when schedule is corrupted)
- **Clear User Data (Logout)**: Complete logout
- **View Logs**: View log file (for debugging errors)
- **About App**: View version, developer info
- **Exit**: Quit app

## FAQ

**Q: Is the app free?**  
A: Yes, completely free and open-source.

**Q: Does the app store passwords?**  
A: No. App only stores encrypted session cookies on your computer, not passwords.

**Q: Why do I need to login again?**  
A: UNETI cookies have expiration. When expired, you need to login again.

**Q: Is the schedule accurate?**  
A: Yes. App fetches schedule directly from UNETI server and auto-refreshes every hour.

**Q: Does the app work offline?**  
A: Yes. When offline, app uses cached schedule. When online again, it auto-updates.

**Q: Why is the app 150MB?**  
A: Electron runtime takes ~80MB (standard for Electron apps). App code is only ~5MB.

**Q: Where is data stored?**  
A: `%APPDATA%/uneti-schedule-widget/`. Cookies are encrypted using Windows Credential Manager.

## Troubleshooting

### Cannot Login

**Symptoms**: Click Login but login window doesn't open.

**Try these**:
1. Check internet connection
2. Temporarily disable firewall/antivirus
3. Restart app
4. Right-click tray → Clear User Data → Try again

### Incorrect or Missing Schedule

**Symptoms**: Schedule doesn't match UNETI website.

**Try these**:
1. Click "Refresh" button
2. If still wrong: Right-click tray → Clear Schedule Data
3. Check logs: Right-click tray → View Logs

### Week Navigation Redirects to Login

**Symptoms**: Clicking Previous/Next redirects to login screen.

**Cause**: Cookies expired.

**Solution**: Login again.

### "You are Offline" Toast Won't Disappear

**Symptoms**: Still shows offline warning despite having internet.

**Try these**:
1. Wait 5-10 seconds
2. Click "Refresh" button
3. Restart app
4. If still not working, try Right-click tray → Exit → Open app

### App Doesn't Auto-Start

**Symptoms**: "Start with Windows" enabled but doesn't auto-start.

**Try these**:
1. Right-click tray → Disable "Start with Windows"
2. Wait 2 seconds
3. Right-click tray → Enable again
4. Restart computer to test

> [!WARNING]
> If you still encounter errors, open an issue on GitHub or contact via email.

## Development

### Tech Stack

- Electron 33.2.1
- JavaScript (ES Modules)
- better-sqlite3 (database)
- Cheerio (HTML parser)
- Keytar (secure cookie storage)

### Setup

```bash
git clone https://github.com/hoaug-tran/uneti-schedule-app.git
cd uneti-schedule-app
npm install
npm run dev
```

### Build

```bash
npm run build
```

Build files will be in `dist/` folder.

## License

MIT License - see [LICENSE](LICENSE) file.

## Contact

**Trần Kính Hoàng (hoaug)**

- GitHub: [@hoaug-tran](https://github.com/hoaug-tran)
- Facebook: [hoaugtr](https://facebook.com/hoaugtr)
- Email: hi@trkhoang.com

---

Made with ❤️ by Trần Kính Hoàng
