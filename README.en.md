# UNETI Schedule Widget

A desktop app for UNETI students to check class schedules quickly and conveniently.

![Version](https://img.shields.io/github/package-json/v/hoaug-tran/uneti-schedule-app?label=Version&style=for-the-badge&color=16a34a)
![Platform](https://img.shields.io/badge/platform-Windows-2563eb?label=Platform&style=for-the-badge)

---

## Introduction

This app was created to make checking UNETI schedules faster and more convenient. Instead of opening a browser, logging into the university website, and going through multiple steps each time - and sometimes dealing with the site being inaccessible - you can now view your schedule with a single click from the system tray.

The application supports offline viewing, so even if the university server is down or your internet connection is unavailable, you can still access your previously saved schedules.

While running with a connection and a valid session, the app refreshes the current week every hour and the following week every six hours. Additionally, you can manually refresh the schedule at any time when needed.

## Screenshots

<p align="center">
  <img src="assets/img/regular.png" width="100%" />
</p>
<p align="center"><em>Regular schedule</em></p>

<p align="center">
  <img src="assets/img/exam.png" width="100%" />
</p>
<p align="center"><em>Exam schedule</em></p>

<p align="center">
  <img src="assets/img/gpa.png" width="100%" />
</p>
<p align="center"><em>Academic results & GPA summary</em></p>

<p align="center">
  <img src="assets/img/aim.png" width="100%" />
</p>
<p align="center"><em>GPA simulation & rank projection</em></p>

<p align="center">
  <img src="assets/img/suggest.png" width="100%" />
</p>
<p align="center"><em>Smart course recommendation to reach target</em></p>

## Main Features

- Display weekly class schedule
- Auto-refresh: current week every 1 hour, next week every 6 hours
- Works offline (uses cached schedule)
- GPA Calculation & Planning: Automatically load official grades, accurately compute 4.0 and 10.0 scale GPA. Real-time two-way simulation (enter projected scores or select target letter grades A/B+/B/C/D). Smart algorithm recommends the minimum courses needed to reach graduation goals (Excellent, Good, Fair). Automatically detects ongoing semesters and filters out GPA-exempt subjects (Physical Education, Defense Education...).
- Dark/Light theme
- Vietnamese/English
- Tray icon for quick access
- Automatically checks for updates every 6 hours

## Installation

### Requirements

- Windows 10/11 (64-bit)

### How to Install

1. Download `.exe` file from [Releases](https://github.com/hoaug-tran/uneti-schedule-app/releases)
2. Run installer
3. Open app and login with UNETI account

> [!IMPORTANT]
> Internet required for first login. After that, app works offline.

## Notice and Disclaimer

> [!IMPORTANT]
> **DISCLAIMER**
>
> This project is an independent open-source initiative and is **NOT** affiliated with, endorsed by, or connected to **UNETI** (University of Economic and Technical Industries).
>
> The application functions by securely accessing the public student portal to retrieve schedule data for the authenticated user. Use this application at your own risk. The author(s) accept no responsibility for any errors, missed classes, or other issues resulting from the use of this software.

> [!NOTE]
> The current installer is unsigned, so Windows may display "Unknown Publisher". Download only from this project’s Releases page and check the version before installing.

## Usage

### Login

First time opening the app will show login window. Enter your UNETI username/password as usual.

> [!NOTE]
> App only stores encrypted session cookies on your computer, not your password.

### View Schedule

After login, schedule will auto-display. Use "← Previous" and "Next →" buttons to navigate weeks.

### GPA Calculation & Planning

1. Click on the **GPA** button on the navigation bar.
2. The app automatically fetches your official academic history from UNETI student portal and computes your 4.0 and 10.0 scale GPA (per semester and cumulative). Ongoing semesters display registered credits and pending courses.
3. **Choose Target**: Select your desired academic honors goal (**Excellent $\ge 3.60$**, **Good $\ge 3.20$**, **Fair $\ge 2.50$**).
4. **Auto Suggestion**: Click the **Auto Suggest** button (✨), and the algorithm will select the fewest courses that need an 'A' grade to achieve your target.
5. **Custom Simulation**: You can customize target letter grades (A, B+, B, C, D) directly via the dropdown, or type projected scores in the **Projected ✎** input. Both fields synchronize in real-time, instantly updating the summary table above. Click **Reset** at any time to return to actual scores.
6. Non-GPA subjects (such as Physical Education, Defense Education, TOEIC entrance tests...) are automatically classified and excluded from GPA calculation.

### Refresh Schedule

Click "Refresh" button to load latest schedule from server. You should refresh before important dates (exams, project deadlines...).

> [!TIP]
> App auto-refreshes every hour, but you should manually refresh before exam days to be sure.

### Tray Menu

Right-click tray icon to open menu:

- **Start with Windows**: Auto-run on computer startup
- **Clear Schedule Data**: Delete cached schedules (use when schedule is corrupted)
- **Logout**: Complete logout and remove all user data
- **View Logs**: View log file (for debugging errors)
- **Introduce**: View version, developer info
- **Auto Check Update**: Auto check update when the app has a new version (enabled by default)
- **Exit**: Quit app

## FAQ

**Q: Is the app free?**  
A: Yes, completely free and open-source.

**Q: Does the app store passwords?**  
A: No. App only stores encrypted session cookies on your computer, not passwords.

**Q: Why do I need to login again?**  
A: UNETI cookies have expiration. When expired, you need to login again.

**Q: Is the schedule accurate?**  
A: Schedules come from UNETI. Saved data may be outdated when a refresh fails or the app is offline; check the student portal when needed.

**Q: Does the app work offline?**  
A: Yes. Saved schedules remain available for up to 30 days, with a warning after six hours. Refresh resumes when the app has a connection and a valid session.

**Q: Where is data stored?**  
A: `%APPDATA%/uneti-schedule-widget/`. Cookies use Windows Credential Manager or operating-system encryption.

## Troubleshooting

### Cannot Login

**Symptoms**: Click Login but login window doesn't open.

**Try these**:
1. Check internet connection
2. Check whether you can sign in to the UNETI student portal in your browser
3. Restart app
4. Right-click tray → Logout → Try again

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

### "You are Offline" Notification Won't Disappear

**Symptoms**: Still shows offline notification despite having internet.

**Try these**:
1. Wait 5-10 seconds
2. Click "Refresh" button
3. Restart app
4. If still not working, try Right-click tray → Exit → Open app

### App does not update automatically / Update failed

**Issue description**:  
The application does not update to a newer version automatically, or the update process fails.

**Possible causes**:
- Unstable or interrupted network connection
- File write permissions blocked by antivirus software or Windows Defender
- Update files being removed during download
- An application or installer error; check the logs for details

**Solution**:
1. Fully exit the application
2. Visit the [Releases](https://github.com/hoaug-tran/uneti-schedule-app/releases) page
3. Download and install the **latest version**
4. Install it over the existing version (no need to uninstall first)

> [!NOTE]
> You may need to sign in again after upgrading if the session has expired or the stored data format has changed.

### App Doesn't Auto-Start

**Symptoms**: "Start with Windows" enabled but doesn't auto-start.

**Try these**:
1. Right-click tray → Disable "Start with Windows"
2. Wait 2 seconds
3. Right-click tray → Enable again
4. Restart computer to test

> [!WARNING]
> If you still encounter errors, please open an [issue](https://github.com/hoaug-tran/uneti-schedule-app/issues) on GitHub or contact me via email.

## Development

### Tech Stack

- Electron 44.x
- JavaScript (ES Modules)
- JSON for schedule and academic-result storage
- Keytar and Electron safeStorage for cookie protection
- Lucide Icons & Vanilla CSS

### Setup

```bash
git clone https://github.com/hoaug-tran/uneti-schedule-app.git
cd uneti-schedule-app
npm ci
npm run dev
```

### Build

```bash
npm run build -- --publish never
```

Build files are written to `dist/`. Run `npm run check` and `npm test` before building.

GitHub Release descriptions are generated from the matching version in [CHANGELOG.md](CHANGELOG.md). See [TEST_UPDATE_SERVER.md](docs/TEST_UPDATE_SERVER.md) for local update-server instructions (Vietnamese).



## License

MIT License - see [LICENSE](LICENSE) file.

## Contact

**Trần Kính Hoàng (hoaug)**

- GitHub: [@hoaug-tran](https://github.com/hoaug-tran)
- Facebook: [hoaugtr](https://facebook.com/hoaugtr)
- Email: hi@trkhoang.com

---

Made with ❤️ by Trần Kính Hoàng - Student of the University of Economics - Technology for Industries (UNETI)
