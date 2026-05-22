(function () {
  const STORAGE_KEY = "doneovernight_lang";
  const SUPPORTED = ["en", "nl"];
  const DEFAULT_LANG = "en";
  let activeLang = DEFAULT_LANG;
  let dictionary = null;
  let observer = null;
  let applying = false;

  function normalizeLang(value) {
    const normalized = String(value || "").toLowerCase().split("-")[0];
    return SUPPORTED.includes(normalized) ? normalized : DEFAULT_LANG;
  }

  function getStoredLang() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function setStoredLang(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (error) {}
  }

  function browserWantsDutch() {
    const languages = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language || ""];
    return languages.some((lang) => normalizeLang(lang) === "nl");
  }

  async function loadDictionary(lang) {
    const safeLang = normalizeLang(lang);
    try {
      const response = await fetch(`/lang/${safeLang}.json`, { cache: "force-cache" });
      if (!response.ok) throw new Error("Language unavailable");
      return await response.json();
    } catch (error) {
      return { language: { code: DEFAULT_LANG }, ui: {}, vocabulary: {}, phraseMap: {} };
    }
  }

  function ensureStyles() {
    if (document.getElementById("don-language-runtime-style")) return;
    const style = document.createElement("style");
    style.id = "don-language-runtime-style";
    style.textContent = `
      .don-lang-switcher {
        position: fixed;
        right: max(14px, env(safe-area-inset-right));
        bottom: max(14px, env(safe-area-inset-bottom));
        z-index: 90;
        display: inline-flex;
        gap: 2px;
        border: 1px solid rgba(233,196,138,.18);
        border-radius: 999px;
        background: rgba(5,6,8,.76);
        box-shadow: 0 18px 44px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.055);
        padding: 4px;
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }
      .don-lang-switcher button,
      .don-lang-modal button {
        font: inherit;
      }
      .don-lang-switcher button {
        min-width: 36px;
        min-height: 28px;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: rgba(245,241,234,.54);
        cursor: pointer;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .14em;
        text-transform: uppercase;
      }
      .don-lang-switcher button.is-active {
        background: rgba(233,196,138,.11);
        color: rgba(255,227,173,.92);
      }
      .don-lang-modal {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: grid;
        place-items: center;
        padding: 20px;
        background: radial-gradient(ellipse 620px 420px at 50% 38%, rgba(233,196,138,.12), transparent 68%), rgba(5,6,8,.76);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }
      .don-lang-modal-card {
        width: min(460px, 100%);
        border: 1px solid rgba(233,196,138,.2);
        border-radius: 10px;
        background: rgba(10,11,14,.9);
        box-shadow: 0 34px 90px rgba(0,0,0,.56), 0 0 70px rgba(233,196,138,.08), inset 0 1px 0 rgba(255,255,255,.06);
        padding: clamp(22px, 5vw, 34px);
        color: rgba(245,241,234,.9);
      }
      .don-lang-modal-kicker {
        margin: 0 0 12px;
        color: #e9c48a;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .18em;
        text-transform: uppercase;
      }
      .don-lang-modal h2 {
        margin: 0;
        color: rgba(245,241,234,.94);
        font-family: Georgia, "Times New Roman", serif;
        font-size: clamp(2rem, 9vw, 3.2rem);
        font-weight: 400;
        line-height: .98;
        letter-spacing: -.035em;
      }
      .don-lang-modal p {
        margin: 14px 0 0;
        color: rgba(245,241,234,.58);
        line-height: 1.65;
      }
      .don-lang-modal-actions {
        display: flex;
        gap: 10px;
        margin-top: 22px;
      }
      .don-lang-modal-actions button {
        flex: 1;
        min-height: 44px;
        border: 1px solid rgba(233,196,138,.34);
        border-radius: 999px;
        background: rgba(233,196,138,.06);
        color: #f4d28a;
        cursor: pointer;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .don-lang-modal-actions button:first-child {
        border-color: rgba(255,255,255,.12);
        background: rgba(255,255,255,.02);
        color: rgba(245,241,234,.64);
      }
      .don-assist-strip {
        position: fixed;
        left: max(14px, env(safe-area-inset-left));
        bottom: max(14px, env(safe-area-inset-bottom));
        z-index: 89;
        max-width: min(420px, calc(100vw - 120px));
        border: 1px solid rgba(233,196,138,.14);
        border-radius: 999px;
        background: rgba(5,6,8,.72);
        box-shadow: 0 18px 44px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.045);
        color: rgba(245,241,234,.68);
        padding: 9px 14px;
        font-size: 12px;
        line-height: 1.35;
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }
      .don-assist-strip strong {
        color: rgba(255,227,173,.9);
        font-weight: 700;
      }
      body.don-nl-page-replaced > :not(.don-lang-switcher):not(.don-lang-modal):not(.don-nl-page):not(.don-assist-strip) {
        display: none !important;
      }
      .don-nl-page {
        min-height: 100vh;
        padding: clamp(22px, 5vw, 56px);
        color: rgba(245,241,234,.9);
        background:
          radial-gradient(ellipse 800px 520px at 78% 10%, rgba(233,196,138,.12), transparent 66%),
          radial-gradient(ellipse 720px 480px at 8% 20%, rgba(255,255,255,.05), transparent 64%),
          #030405;
      }
      .don-nl-shell {
        width: min(1040px, 100%);
        margin: 0 auto;
      }
      .don-nl-nav {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        align-items: center;
        padding-bottom: clamp(50px, 10vw, 110px);
      }
      .don-nl-brand {
        color: rgba(245,241,234,.88);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 13px;
        letter-spacing: .32em;
        text-transform: uppercase;
        text-decoration: none;
      }
      .don-nl-links {
        display: flex;
        gap: 14px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .don-nl-links a,
      .don-nl-cta {
        color: rgba(245,241,234,.64);
        font-size: 13px;
        text-decoration: none;
      }
      .don-nl-hero {
        max-width: 820px;
        padding-bottom: clamp(34px, 7vw, 76px);
      }
      .don-nl-kicker,
      .don-nl-section-kicker {
        color: #e9c48a;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .22em;
        text-transform: uppercase;
      }
      .don-nl-hero h1 {
        margin: 18px 0 18px;
        color: rgba(245,241,234,.96);
        font-family: Georgia, "Times New Roman", serif;
        font-size: clamp(3rem, 11vw, 7rem);
        font-weight: 400;
        letter-spacing: -.055em;
        line-height: .92;
      }
      .don-nl-hero p,
      .don-nl-card p {
        color: rgba(245,241,234,.66);
        font-size: clamp(1rem, 2vw, 1.2rem);
        line-height: 1.75;
      }
      .don-nl-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
        margin: 28px 0;
      }
      .don-nl-card {
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 10px;
        background: linear-gradient(135deg, rgba(255,255,255,.055), rgba(255,255,255,.018));
        box-shadow: 0 28px 70px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.055);
        padding: clamp(20px, 4vw, 32px);
      }
      .don-nl-card h2 {
        margin: 10px 0 10px;
        color: rgba(245,241,234,.92);
        font-family: Georgia, "Times New Roman", serif;
        font-size: clamp(1.8rem, 4vw, 3rem);
        font-weight: 400;
        letter-spacing: -.04em;
      }
      .don-nl-list {
        display: grid;
        gap: 12px;
        margin: 18px 0 0;
        padding: 0;
        list-style: none;
      }
      .don-nl-list li {
        border-top: 1px solid rgba(255,255,255,.08);
        padding-top: 12px;
        color: rgba(245,241,234,.68);
        line-height: 1.6;
      }
      .don-nl-cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 46px;
        margin-top: 22px;
        border: 1px solid rgba(233,196,138,.32);
        border-radius: 999px;
        padding: 0 20px;
        color: #f4d28a;
        background: rgba(233,196,138,.06);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .14em;
        text-transform: uppercase;
      }
      @media (max-width: 520px) {
        .don-lang-switcher {
          right: 10px;
          bottom: 10px;
        }
        .don-assist-strip {
          left: 10px;
          right: 92px;
          max-width: none;
          border-radius: 14px;
          font-size: 11px;
        }
        .don-lang-modal-actions {
          display: grid;
        }
        .don-nl-page {
          padding: 18px 16px 76px;
        }
        .don-nl-nav {
          align-items: flex-start;
          padding-bottom: 54px;
        }
        .don-nl-links {
          display: none;
        }
        .don-nl-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function translateText(value) {
    if (!dictionary || activeLang === DEFAULT_LANG) return value;
    const key = String(value || "").replace(/\s+/g, " ").trim();
    return dictionary.phraseMap?.[key] || value;
  }

  function translateLoose(value) {
    if (!dictionary || activeLang === DEFAULT_LANG) return value;
    const source = String(value || "");
    const direct = translateText(source);
    return direct;
  }

  function pageKey() {
    const host = (window.location.hostname || "").toLowerCase();
    const path = (window.location.pathname || "/").replace(/\/index\.html$/, "/");
    const normalized = path.endsWith("/") ? path : `${path}/`;
    if (normalized === "/" && host.startsWith("portal.")) return "portal_access";
    if (normalized === "/" && host.startsWith("operator.")) return "operator";
    if (normalized === "/" && host.startsWith("client.")) return "client";
    if (normalized === "/") return "home";
    if (normalized === "/task/") return "task";
    if (normalized === "/task/submitted/") return "task_submitted";
    if (normalized === "/review/") return "review";
    if (normalized === "/workspace/") return "workspace";
    if (normalized === "/operator/") return "operator";
    if (normalized === "/admin/") return "admin";
    if (normalized === "/client-invite/") return "client_invite";
    if (path.endsWith("/thanks.html") || normalized === "/thanks/") return "thanks";
    if (normalized === "/portal/") return "portal_access";
    if (path.endsWith("/portal.html")) return "portal";
    if (path.endsWith("/trust.html") || normalized === "/trust/") return "trust";
    if (path.endsWith("/enterprise.html") || normalized === "/enterprise/") return "enterprise";
    if (path.endsWith("/terms.html") || normalized === "/terms/") return "terms";
    if (path.endsWith("/privacy.html") || normalized === "/privacy/") return "privacy";
    if (path.endsWith("/refund.html") || normalized === "/refund/") return "refund";
    if (normalized === "/client-onboarding/") return "client";
    if (normalized === "/operator-apply/") return "operator_apply";
    return "";
  }

  function setText(selector, value, root = document) {
    if (!selector || value === undefined || value === null) return;
    root.querySelectorAll(selector).forEach((element) => {
      element.textContent = value;
    });
  }

  function setHtml(selector, value, root = document) {
    if (!selector || value === undefined || value === null) return;
    root.querySelectorAll(selector).forEach((element) => {
      element.innerHTML = value;
    });
  }

  function setAttr(selector, attr, value, root = document) {
    if (!selector || !attr || value === undefined || value === null) return;
    root.querySelectorAll(selector).forEach((element) => {
      element.setAttribute(attr, value);
    });
  }

  function syncDocumentChrome() {
    if (!dictionary || activeLang === DEFAULT_LANG) return;
    const page = dictionary.pages?.[pageKey()];
    if (page?.title) {
      document.title = page.title;
    } else {
      const translatedTitle = translateLoose(document.title);
      if (translatedTitle !== document.title) document.title = translatedTitle;
    }

    document.querySelectorAll('meta[name="description"], meta[property="og:title"], meta[property="og:description"]').forEach((meta) => {
      const original = meta.getAttribute("content");
      const translated = page?.description && meta.getAttribute("name") === "description"
        ? page.description
        : translateLoose(original);
      if (translated !== original) meta.setAttribute("content", translated);
    });
  }

  function syncLanguageInputs() {
    const lang = activeLang || DEFAULT_LANG;
    document.querySelectorAll("form").forEach((form) => {
      ["doneovernight_lang", "notification_language"].forEach((name) => {
        let input = form.querySelector(`input[name="${name}"]`);
        if (!input) {
          input = document.createElement("input");
          input.type = "hidden";
          input.name = name;
          form.appendChild(input);
        }
        input.value = lang;
      });
    });
  }

  function syncEmailRuntimeFields() {
    if (!dictionary || activeLang === DEFAULT_LANG) return;
    document.querySelectorAll('input[type="hidden"][name="_subject"], input[type="hidden"][name="_autoresponse"], input[type="hidden"][name="subject"], input[type="hidden"][name="text"]').forEach((input) => {
      const original = input.value;
      const translated = translateLoose(original);
      if (translated !== original) input.value = translated;
    });
  }

  function applyPageLocalization(root = document) {
    if (!dictionary || activeLang === DEFAULT_LANG) return;
    const page = dictionary.pages?.[pageKey()];
    if (!page) return;

    (page.text || []).forEach((item) => setText(item.selector, item.value, root));
    (page.html || []).forEach((item) => setHtml(item.selector, item.value, root));
    (page.attrs || []).forEach((item) => setAttr(item.selector, item.attr, item.value, root));
  }

  function renderAssistanceLayer() {
    if (activeLang !== "nl" || document.querySelector(".don-assist-strip")) return;
    if (/admin|operator/i.test(window.location.pathname || "")) return;
    const strip = document.createElement("div");
    strip.className = "don-assist-strip";
    strip.innerHTML = "<strong>Digitale ondersteuning</strong> · rustig, duidelijk en professioneel.";
    document.body.appendChild(strip);
  }

  function applyTranslations(root = document.body) {
    if (!root || !dictionary || applying || activeLang === DEFAULT_LANG) return;
    applying = true;
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "OPTION"].includes(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach((node) => {
        const translated = translateLoose(node.nodeValue);
        if (translated !== node.nodeValue) node.nodeValue = translated;
      });

      document.querySelectorAll("[placeholder], [aria-label], [title]").forEach((element) => {
        ["placeholder", "aria-label", "title"].forEach((attr) => {
          if (!element.hasAttribute(attr)) return;
          const original = element.getAttribute(attr);
          const translated = translateLoose(original);
          if (translated !== original) element.setAttribute(attr, translated);
        });
      });

      applyPageLocalization(root);
      syncDocumentChrome();
      syncLanguageInputs();
      syncEmailRuntimeFields();
    } finally {
      applying = false;
    }
  }

  function startObserver() {
    if (observer || activeLang === DEFAULT_LANG) return;
    observer = new MutationObserver((mutations) => {
      if (applying) return;
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) applyTranslations(node);
          if (node.nodeType === Node.TEXT_NODE && node.parentElement) applyTranslations(node.parentElement);
        });
        if (mutation.type === "characterData" && mutation.target.parentElement) {
          applyTranslations(mutation.target.parentElement);
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function renderSwitcher() {
    if (document.querySelector(".don-lang-switcher")) return;
    const switcher = document.createElement("div");
    switcher.className = "don-lang-switcher";
    switcher.setAttribute("aria-label", dictionary?.ui?.switchLabel || "Language");
    switcher.innerHTML = `
      <button type="button" data-don-lang="en">EN</button>
      <button type="button" data-don-lang="nl">NL</button>
    `;
    document.body.appendChild(switcher);
    switcher.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.donLang === activeLang);
      button.addEventListener("click", () => {
        const nextLang = normalizeLang(button.dataset.donLang);
        setStoredLang(nextLang);
        window.location.reload();
      });
    });
  }

  function renderPromptIfNeeded() {
    if (getStoredLang() || !browserWantsDutch()) return;
    const modal = document.createElement("div");
    modal.className = "don-lang-modal";
    modal.innerHTML = `
      <div class="don-lang-modal-card" role="dialog" aria-modal="true" aria-labelledby="donLangTitle">
        <p class="don-lang-modal-kicker">DONEOVERNIGHT runtime</p>
        <h2 id="donLangTitle">${dictionary?.ui?.promptTitle || "Continue in Nederlands?"}</h2>
        <p>${dictionary?.ui?.promptCopy || "DONEOVERNIGHT can adapt the operational layer to Dutch. English remains the default international runtime."}</p>
        <div class="don-lang-modal-actions">
          <button type="button" data-don-modal-lang="en">${dictionary?.ui?.english || "English"}</button>
          <button type="button" data-don-modal-lang="nl">${dictionary?.ui?.dutch || "Nederlands"}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelectorAll("[data-don-modal-lang]").forEach((button) => {
      button.addEventListener("click", () => {
        setStoredLang(normalizeLang(button.dataset.donModalLang));
        window.location.reload();
      });
    });
  }

  async function init() {
    const stored = getStoredLang();
    activeLang = normalizeLang(stored || DEFAULT_LANG);
    dictionary = await loadDictionary(activeLang);
    document.documentElement.lang = activeLang;
    window.DONEOVERNIGHT_LANG = {
      get: () => activeLang,
      t: translateLoose,
      dictionary: () => dictionary,
      apply: () => applyTranslations()
    };
    ensureStyles();
    renderSwitcher();
    syncLanguageInputs();
    if (activeLang !== DEFAULT_LANG) {
      syncDocumentChrome();
      applyPageLocalization();
      applyTranslations();
      renderAssistanceLayer();
      startObserver();
    }
    renderPromptIfNeeded();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
