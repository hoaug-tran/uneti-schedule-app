# UNETI Schedule Widget

![Version](https://img.shields.io/badge/version-1.4.4-blue.svg?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)

A modern, high-performance desktop widget for viewing student schedules at **UNETI** (University of Economic and Technical Industries). Built with **Electron** and **Node.js**, designed for stability, privacy, and ease of use.

![alt text](image.png)

**[Read in Vietnamese / Đọc bằng tiếng Việt](README.en.md)**

---

> [!IMPORTANT]
> **DISCLAIMER**
>
> This project is an independent open-source initiative and is **NOT** affiliated with, endorsed by, or connected to **UNETI** (University of Economic and Technical Industries).
>
> The application functions by securely accessing the public student portal to retrieve schedule data for the authenticated user. Use this application at your own risk. The author(s) accept no responsibility for any errors, missed classes, or other issues resulting from the use of this software.

---

## Features

*   **Desktop Widget**: Always-on-top (optional), persistent widget for quick schedule checks.
*   **Smart Schedule**: Automatically fetches, parses, and displays weekly schedules.
*   **Exam Support**: Distinct styling for exam schedules to easily identify.
*   **Secure & Private**:
    *   **Context Isolation**: Enabled for maximum security.
    *   **Secure Storage**: Credentials/Cookies stored via OS-level encryption (Keytar).
    *   **No Tracking**: No personal data is sent to third-party servers.
*   **Efficient**: Low resource usage, optimized for background running.
*   **Theming**: Beautiful Dark and Light modes (syncs with system).
*   **Bilingual**: Full English and Vietnamese support.
*   **Offline Capable**: Caches schedules for viewing without internet.

## Installation

1.  Go to the **[Releases](https://github.com/hoaug-tran/uneti-schedule-app/releases)** page.
2.  Download the latest installer: `uneti-schedule-widget-x.x.x-setup.exe`.
3.  Run the installer. The app will launch automatically.
4.  Log in with your **UNETI Student Account**.

## Usage

*   **Navigation**: Use **Previous** / **Next** buttons to navigate weeks.
*   **Refresh**: Click the **Refresh** icon to force an update from the server.
*   **Settings**: Customize theme and language via the interface.
*   **Minimize**: Click the **Minimize** button or press `Esc` to hide to system tray.
*   **Quit**: Right-click the system tray icon -> `Exit`.
*   **Auto Start**: Enable/Disable via the interface by right-clicking the system tray icon -> `Start with Windows`.

## Troubleshooting

### "Session Expired" Loop
If you constantly see "Session Expired":
1.  Click **Logout** (if available) or Restart the application.
2.  Log in again to refresh your secure cookies.

### Schedule Not Updating
*   Check your internet connection.
*   The app caches data aggressively for offline use. Click **Refresh** to pull the latest data.
*   If the school portal is down, the app will show the last cached version.

### Missing Exam Schedule
Exam detection is automated based on schedule keywords. If an exam appears as a regular class:
1.  **Update** the app to the latest version (detection logic may change or break due to changes in the school portal).
2.  Report the [issue](https://github.com/hoaug-tran/uneti-schedule-app/issues) on GitHub about the error with a screenshot of the raw schedule on the portal.

## Technology Stack

*   **Core**: Electron, Node.js
*   **Frontend**: HTML5, CSS3, JavaScript (ESM)
*   **Security**: Electron `contextBridge`, `keytar`
*   **Parser**: `cheerio`

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

*This software is a fan-made project created to help UNETI students manage their time better.*
