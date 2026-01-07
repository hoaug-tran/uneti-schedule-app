const LANGUAGES = {
  VI: "vi",
  EN: "en",
};

const TRANSLATIONS = {
  vi: {
    title: "Lịch học UNETI",
    updated: "Cập nhật",
    week: "Tuần",
    checkUpdate: "Cập nhật",
    login: "Đăng nhập",
    loginAgain: "Đăng nhập",
    refresh: "Làm mới",
    minimize: "Thu nhỏ",
    exit: "Thoát",
    previous: "← Trước",
    next: "Sau →",
    noData: "Chưa có dữ liệu",
    noDataDesc: "Chưa có dữ liệu lịch. Bạn cần đăng nhập để tải lịch.",
    period: "Tiết",
    instructor: "GV",
    noClass: "Không phải đi học 🎉",
    checking: "Đang kiểm tra...",
    loading: "Đang tải...",
    loginSuccess: "Đăng nhập thành công, lịch đã cập nhật!",
    loginFailed: "Đăng nhập thất bại:",
    scheduleUpdated: "Lịch đã cập nhật!",
    loadFailed: "Không tải được lịch:",
    sessionExpired: "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.",
    renderError: "Có lỗi khi hiển thị:",
    checkError: "Lỗi kiểm tra:",
    latestVersion: "Bạn đang dùng phiên bản mới nhất",
    newUpdate: "Có bản cập nhật mới",
    clickToUpdate: "Bấm để cập nhật ngay.",
    updateNow: "Cập nhật ngay",
    updating: "Đang cập nhật",
    updateFailed: "Không thể bắt đầu tải cập nhật.",
    updateDownloaded:
      "Đã tải xong bản cập nhật. Chuẩn bị khởi động lại để cài đặt...",
    updateError: "Lỗi cập nhật:",
    offlineWarning: "Bạn đang Offline, lịch có thể không là mới nhất",
    onlineRestored: "Bạn đang Online",
    offlineMode: "Đang dùng dữ liệu đã lưu (Offline)",
    fetchingWeek: "Đang tải lịch tuần...",
    fetchSuccess: "Đã tải lịch thành công",
    noDataForWeek: "Không có dữ liệu cho tuần này",
    trayStartWithWindows: "Khởi động cùng Windows",
    trayClearSchedule: "Xoá dữ liệu lịch",
    trayClearUserData: "Xoá dữ liệu người dùng (Đăng xuất)",
    trayViewLogs: "Xem nhật ký",
    trayAbout: "Giới thiệu",
    trayAutoUpdate: "Tự động cập nhật",
    trayExit: "Thoát",
    refreshReminder: "💡 Để đảm bảo lịch luôn chính xác, bạn nên bấm Làm mới thường xuyên",
    aboutTitle: "Về Widget Lịch học UNETI",
    aboutDeveloper: "Phát triển bởi",
    aboutVersion: "Phiên bản",
    aboutGitHub: "GitHub",
    aboutEmail: "Email",
    updateChecking: "Đang kiểm tra cập nhật...",
    updateAvailable: "Có bản cập nhật mới",
    updateAvailableMessage: "Có bản cập nhật mới: v{version}. Bấm để cập nhật ngay!",
    updateDownloading: "Đang tải cập nhật",
    updateDownloaded: "Đã tải xong, đang khởi động lại...",
    updateRestarting: "Đang khởi động lại...",
    updateNotAvailable: "Bạn đang dùng bản mới nhất",
    updateError: "Lỗi khi kiểm tra cập nhật",
    updateSuccess: "Cập nhật thành công lên phiên bản {version}!",
    updateNow: "Cập nhật ngay",
    updateLater: "Để sau",
    updateRestart: "Khởi động lại",
    updateCurrentVersion: "Phiên bản hiện tại",
    updateNewVersion: "Phiên bản mới",
    trayCheckUpdate: "Kiểm tra cập nhật",
  },
  en: {
    title: "UNETI Schedule",
    updated: "Updated",
    week: "Week",
    checkUpdate: "Update",
    login: "Login",
    loginAgain: "Login",
    refresh: "Refresh",
    minimize: "Minimize",
    exit: "Exit",
    previous: "← Previous",
    next: "Next →",
    noData: "No data",
    noDataDesc: "No schedule data. You need to login to load schedule.",
    period: "Period",
    instructor: "Instructor",
    noClass: "No class today 🎉",
    checking: "Checking...",
    loading: "Loading...",
    loginSuccess: "Login successful, schedule updated!",
    loginFailed: "Login failed:",
    scheduleUpdated: "Schedule updated!",
    loadFailed: "Failed to load schedule:",
    sessionExpired: "Session expired, please login again.",
    renderError: "Error rendering:",
    checkError: "Check error:",
    latestVersion: "You are using the latest version",
    newUpdate: "New update available",
    clickToUpdate: "Click to update.",
    updateNow: "Update Now",
    updating: "Updating",
    updateFailed: "Failed to start update download.",
    updateDownloaded: "Downloaded. Restarting in {seconds}s...",
    updateError: "Update error:",
    offlineWarning: "You are Offline, schedule may not be up to date",
    onlineRestored: "You are Online",
    offlineMode: "Using cached data (Offline)",
    fetchingWeek: "Loading week schedule...",
    fetchSuccess: "Schedule loaded successfully",
    noDataForWeek: "No data for this week",
    trayStartWithWindows: "Start with Windows",
    trayClearSchedule: "Clear Schedule Data",
    trayClearUserData: "Clear User Data (Logout)",
    trayViewLogs: "View Logs",
    trayAbout: "About",
    trayAutoUpdate: "Auto Update",
    trayExit: "Exit",
    refreshReminder: "💡 To ensure schedule accuracy, please refresh regularly",
    aboutTitle: "About UNETI Schedule Widget",
    aboutDeveloper: "Developed by",
    aboutVersion: "Version",
    aboutGitHub: "GitHub",
    aboutEmail: "Email",
    updateChecking: "Checking for updates...",
    updateAvailable: "New update available",
    updateAvailableMessage: "New update available: v{version}. Click to update now!",
    updateDownloading: "Downloading update",
    updateDownloaded: "Downloaded, restarting...",
    updateNotAvailable: "You're using the latest version",
    updateError: "Error checking for updates",
    updateSuccess: "Successfully updated to version {version}!",
    updateNow: "Update Now",
    updateLater: "Later",
    updateRestart: "Restart Now",
    updateCurrentVersion: "Current version",
    updateNewVersion: "New version",
    trayCheckUpdate: "Check for Updates",
  },
};

class i18n {
  constructor() {
    this.currentLang = this.loadLanguage();
  }

  loadLanguage() {
    try {
      const stored = localStorage.getItem("app-language");
      if (stored && TRANSLATIONS[stored]) return stored;
    } catch { }
    return LANGUAGES.VI;
  }

  setLanguage(lang) {
    if (TRANSLATIONS[lang]) {
      this.currentLang = lang;
      try {
        localStorage.setItem("app-language", lang);
      } catch { }
      document.documentElement.lang = lang;
      window.dispatchEvent(
        new CustomEvent("languagechange", { detail: { lang } })
      );
    }
  }

  t(key) {
    return TRANSLATIONS[this.currentLang][key] || TRANSLATIONS.vi[key] || key;
  }

  getLang() {
    return this.currentLang;
  }

  getAvailableLanguages() {
    return Object.keys(TRANSLATIONS);
  }
}

export const i18nInstance = new i18n();
