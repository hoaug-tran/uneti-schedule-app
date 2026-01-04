const LANGUAGES = {
  VI: "vi",
  EN: "en",
};

const TRANSLATIONS = {
  vi: {
    title: "Lịch học UNETI",
    updated: "Cập nhật",
    week: "Tuần",
    checkUpdate: "Kiểm tra cập nhật",
    login: "Đăng nhập",
    loginAgain: "Đăng nhập lại",
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
  },
  en: {
    title: "UNETI Schedule",
    updated: "Updated",
    week: "Week",
    checkUpdate: "Check Update",
    login: "Login",
    loginAgain: "Login Again",
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
    updateDownloaded: "Update downloaded. Restarting to install...",
    updateError: "Update error:",
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
