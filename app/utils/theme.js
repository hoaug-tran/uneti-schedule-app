const THEMES = {
    LIGHT: "light",
    DARK: "dark",
    SYSTEM: "system",
};

class ThemeManager {
    constructor() {
        this.currentTheme = this.loadTheme();
        this.applyTheme(this.currentTheme);
        this.setupSystemThemeListener();
    }

    loadTheme() {
        try {
            const stored = localStorage.getItem("app-theme");
            if (stored && Object.values(THEMES).includes(stored)) return stored;
        } catch { }
        return THEMES.DARK;
    }

    saveTheme(theme) {
        try {
            localStorage.setItem("app-theme", theme);
        } catch { }
    }

    getSystemTheme() {
        return window.matchMedia("(prefers-color-scheme: dark)").matches
            ? THEMES.DARK
            : THEMES.LIGHT;
    }

    applyTheme(theme) {
        this.currentTheme = theme;
        let effectiveTheme = theme;

        if (theme === THEMES.SYSTEM) {
            effectiveTheme = this.getSystemTheme();
        }

        document.documentElement.setAttribute("data-theme", effectiveTheme);
        this.saveTheme(theme);

        window.dispatchEvent(
            new CustomEvent("themechange", { detail: { theme, effectiveTheme } })
        );
    }

    cycleTheme() {
        const themes = [THEMES.LIGHT, THEMES.DARK, THEMES.SYSTEM];
        const currentIndex = themes.indexOf(this.currentTheme);
        const nextIndex = (currentIndex + 1) % themes.length;
        this.applyTheme(themes[nextIndex]);
    }

    setupSystemThemeListener() {
        window
            .matchMedia("(prefers-color-scheme: dark)")
            .addEventListener("change", () => {
                if (this.currentTheme === THEMES.SYSTEM) {
                    this.applyTheme(THEMES.SYSTEM);
                }
            });
    }

    getTheme() {
        return this.currentTheme;
    }

    getEffectiveTheme() {
        return this.currentTheme === THEMES.SYSTEM
            ? this.getSystemTheme()
            : this.currentTheme;
    }
}

export const themeManager = new ThemeManager();
