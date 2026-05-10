// Language code mappings
const languageCodes = {
  'en': 'English',
  'es': 'Español',
  'fr': 'Français',
  'ar': 'العربية',
  'tr': 'Türkçe',
  'vi': 'Tiếng Việt',
  'pl': 'Polski',
  'it': 'Italiano',
  'de': 'Deutsch'
};

const rtlLanguages = ['ar'];

function getBrowserLanguage() {
  const browserLang = navigator.language || navigator.userLanguage;
  const langCode = browserLang.split('-')[0];
  const supportedLangs = Object.keys(languageCodes);
  return supportedLangs.includes(langCode) ? langCode : 'en';
}

// i18next initialization
const i18nConfig = {
  lng: localStorage.getItem('language') || getBrowserLanguage(),
  fallbackLng: 'en',
  resources: {}
};

function loadTranslations(callback) {
  const languages = Object.keys(languageCodes);
  let loaded = 0;

  languages.forEach(lang => {
    fetch(`/assets/i18n/${lang}.json`)
      .then(response => response.json())
      .then(data => {
        i18nConfig.resources[lang] = { translation: data };
        loaded++;
        if (loaded === languages.length) {
          initI18next(callback);
        }
      })
      .catch(err => console.error(`Failed to load language ${lang}:`, err));
  });
}

function initI18next(callback) {
  window.i18n = {
    language: i18nConfig.lng,
    resources: i18nConfig.resources,

    t(key) {
      const keys = key.split('.');
      let value = this.resources[this.language]?.translation;

      for (const k of keys) {
        value = value?.[k];
      }

      return value || key;
    },

    setLanguage(lang) {
      if (!Object.keys(languageCodes).includes(lang)) return;

      this.language = lang;
      localStorage.setItem('language', lang);
      document.documentElement.lang = lang;

      if (rtlLanguages.includes(lang)) {
        document.documentElement.dir = 'rtl';
      } else {
        document.documentElement.dir = 'ltr';
      }

      updatePageContent();
    }
  };

  // Set initial language direction
  if (rtlLanguages.includes(i18nConfig.lng)) {
    document.documentElement.dir = 'rtl';
  }
  document.documentElement.lang = i18nConfig.lng;

  if (callback) callback();
}

function updatePageContent() {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const isHtml = element.getAttribute('data-i18n-html') === 'true';
    const content = window.i18n.t(key);

    if (isHtml) {
      element.innerHTML = content;
    } else {
      element.textContent = content;
    }
  });

  // Update placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const key = element.getAttribute('data-i18n-placeholder');
    element.placeholder = window.i18n.t(key);
  });

  // Update aria-labels
  document.querySelectorAll('[data-i18n-aria]').forEach(element => {
    const key = element.getAttribute('data-i18n-aria');
    element.setAttribute('aria-label', window.i18n.t(key));
  });
}

function createLanguageSwitcher() {
  const nav = document.querySelector('.site-header .nav');
  if (!nav) return;

  // Create switcher container
  const switcher = document.createElement('div');
  switcher.className = 'lang-switcher';

  const button = document.createElement('button');
  button.className = 'lang-toggle';
  button.setAttribute('aria-label', 'Change language');
  button.type = 'button';
  button.innerHTML = 'Language <span class="lang-arrow">▾</span>';

  const menu = document.createElement('div');
  menu.className = 'lang-menu';

  Object.entries(languageCodes).forEach(([code, name]) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'lang-option' + (code === window.i18n.language ? ' active' : '');
    option.textContent = name;
    option.onclick = (e) => {
      e.preventDefault();
      window.i18n.setLanguage(code);

      // Update active state
      document.querySelectorAll('.lang-option').forEach(opt => {
        opt.classList.remove('active');
      });
      option.classList.add('active');

      // Close menu
      menu.classList.remove('open');
    };
    menu.appendChild(option);
  });

  button.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    menu.classList.toggle('open');
  };

  // Close menu on outside click
  document.addEventListener('click', (e) => {
    if (!switcher.contains(e.target)) {
      menu.classList.remove('open');
    }
  });

  switcher.appendChild(button);
  switcher.appendChild(menu);

  // Insert as a nav item — before the "Request a Quote" CTA button
  const ctaBtn = nav.querySelector('.cta-btn');
  if (ctaBtn) {
    nav.insertBefore(switcher, ctaBtn);
  } else {
    nav.appendChild(switcher);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  loadTranslations(() => {
    createLanguageSwitcher();
    updatePageContent();
  });
});
