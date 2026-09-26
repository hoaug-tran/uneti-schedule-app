export const API_FIELDS = {
  GRADES_STUDENT_ID: "TC_SV_KetQuaHocTap_MaSinhVien",
  GRADES_SUBJECT_ID: "TC_SV_KetQuaHocTap_MaMonHoc",
  GRADES_COURSE_ID: "TC_SV_KetQuaHocTap_MaHocPhan",
  GRADES_CLASS_SECTION_ID: "TC_SV_KetQuaHocTap_MaLopHocPhan",
  GRADES_SUBJECT_NAME: "TC_SV_KetQuaHocTap_TenMonHoc",
  GRADES_CREDITS: "TC_SV_KetQuaHocTap_SoTinChi",
  GRADES_LETTER: "TC_SV_KetQuaHocTap_DiemChu",
  GRADES_GRADE_POINT: "TC_SV_KetQuaHocTap_DiemTinChi",
  GRADES_FINAL_SCORE: "TC_SV_KetQuaHocTap_DiemTongKet",
  GRADES_EXCLUDED_GPA: "TC_SV_KetQuaHocTap_KhongTinhDiemTBC",
  GRADES_SEMESTER: "TC_SV_KetQuaHocTap_HocKy",
  GRADES_CLASS_NAME: "TC_SV_KetQuaHocTap_TenLopHoc",
  GPA_SEMESTER_NAME: "TC_SV_KetQuaHocTap_TenDot",
  GPA_SEMESTER_10: "TC_SV_KetQuaHocTap_DiemTrungBinhHocKy",
  GPA_SEMESTER_4: "TC_SV_KetQuaHocTap_DiemTrungBinhHocKy_He4",
  GPA_CUMULATIVE_10: "TC_SV_KetQuaHocTap_DiemTrungBinhTichLuy",
  GPA_CUMULATIVE_4: "TC_SV_KetQuaHocTap_DiemTrungBinhTichLuy_He4",
  GPA_REGISTERED_CREDITS: "TC_SV_KetQuaHocTap_TongTinChi_DangKy",
  GPA_ACCUMULATED_CREDITS: "TC_SV_KetQuaHocTap_TongTinChi_TichLuy",
  GPA_DEBT_CREDITS: "TC_SV_KetQuaHocTap_TongTinChi_No",
  GPA_ACADEMIC_RANK: "TC_SV_KetQuaHocTap_XepLoaiHocLuc_TichLuy",
  GPA_TRAINING_POINT: "TC_SV_KetQuaHocTap_DiemRenLuyen",
  GPA_TRAINING_RANK: "TC_SV_KetQuaHocTap_DiemRenLuyen_XepLoai",
  CURRICULUM_STUDENT_ID: "MaSinhVien",
  CURRICULUM_COURSE_ID: "TC_SV_ChuongTrinhKhung_MaHocPhan",
  CURRICULUM_COURSE_NAME: "TC_SV_ChuongTrinhKhung_TenHocPhan",
  CURRICULUM_CREDITS: "TC_SV_ChuongTrinhKhung_SoTinChi",
  CURRICULUM_IS_GPA: "TC_SV_ChuongTrinhKhung_IsTinhTBC",
  CURRICULUM_KHOA_HOC: "TC_SV_ChuongTrinhKhung_KhoaHoc",
  CURRICULUM_NGANH_HOC: "TC_SV_ChuongTrinhKhung_NganhHoc",
};

export const GPA_TARGETS = {
  excellent: 3.6,
  good: 3.2,
  fair: 2.5,
};

export const LETTER_POINTS = {
  "A+": 4.0,
  A: 4.0,
  "B+": 3.5,
  B: 3.0,
  "C+": 2.5,
  C: 2.0,
  "D+": 1.5,
  D: 1.0,
  F: 0.0,
};

export const GRADE_BANDS = [
  [8.5, 4.0, "A"],
  [7.8, 3.5, "B+"],
  [7.0, 3.0, "B"],
  [6.3, 2.5, "C+"],
  [5.5, 2.0, "C"],
  [4.8, 1.5, "D+"],
  [4.0, 1.0, "D"],
  [0.0, 0.0, "F"],
];

export const RANK_THRESHOLDS = [
  { min: 3.6, rank: "Xuất sắc", rankEn: "Excellent", order: 5 },
  { min: 3.2, rank: "Giỏi", rankEn: "Good", order: 4 },
  { min: 2.5, rank: "Khá", rankEn: "Fair", order: 3 },
  { min: 2.0, rank: "Trung bình", rankEn: "Average", order: 2 },
  { min: 0.0, rank: "Yếu", rankEn: "Poor", order: 1 },
];

export const NON_GPA_SUBJECT_PATTERNS = [
  /giáo\s*dục\s*quốc\s*phòng/i,
  /quốc\s*phòng\s*-\s*an\s*ninh/i,
  /\bgdqp\b/i,
  /giáo\s*dục\s*thể\s*chất/i,
  /\bgdtc\b/i,
  /chuẩn\s*đầu\s*ra/i,
  /tiếng\s*anh\s*tăng\s*cường/i,
  /kỹ\s*năng\s*mềm/i,
];

export const IPC_CHANNELS = {
  SCHEDULE_LOAD_FILE: "schedule:load-file",
  SCHEDULE_COOKIES_EXISTS: "schedule:cookies-exists",
  ACADEMIC_LOAD_FILE: "academic:load-file",
  ACADEMIC_REFRESH: "academic:refresh",
  GPA_PLAN: "gpa:plan",
  GPA_SIMULATE: "gpa:simulate",
  GPA_CUSTOM_PLAN: "gpa:custom-plan",
  WIDGET_HIDE: "widget:hide",
  WIDGET_QUIT: "widget:quit",
  WIDGET_REFRESH: "widget:refresh",
  WIDGET_FETCH_WEEK: "widget:fetch-week",
  WIDGET_LOGIN: "widget:login",
  WIDGET_LOGOUT: "widget:logout",
  APP_CHECK_UPDATE: "app:check-update",
  APP_INSTALL_UPDATE: "app:install-update",
  APP_CONFIRM_INSTALL: "app:confirm-install",
  APP_GET_VERSION: "app:get-version",
  LOGGER_LOG: "logger:log",
  I18N_SET_LANG: "i18n:set-lang",
  WINDOW_RESIZE_HEIGHT: "window:resize-height",
};
