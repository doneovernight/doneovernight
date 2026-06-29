(() => {
  const storageKey = "doneovernight.experience.v1";
  const emailKey = "doneovernight.experience.email.v1";
  const state = read(storageKey, {});
  const savedEmail = read(emailKey, null);
  let lang = state.lang || detectLang();

  const copy = {
    en: {
      navLive: "Live",
      navStory: "Experience",
      scroll: "Scroll",
      step: "Step",
      entryKicker: "DONEOVERNIGHT",
      entryTitle: "Every business becomes software eventually.",
      entryText: "Let's show you how.",
      discover: "How did you discover DONEOVERNIGHT?",
      interests: "What interests you most?",
      multiple: "Choose anything that pulls your attention.",
      storyTitle: "We don't sell AI. We build operating systems.",
      storyCopy: "The useful part is not a model. It is the way work moves.",
      oldWorkflow: "Old workflow",
      newWorkflow: "Connected workflow",
      workflowTitle: "Workflow becomes visible.",
      examples: "Choose a world.",
      operatorQuestion: "What makes an operator?",
      operatorCopy: "No wrong answers. The pattern matters more than the score.",
      reflectionOne: "Where are you today?",
      reflectionTwo: "What would you automate first?",
      otherPlaceholder: "Type your own answer",
      gateTitle: "Unlock what happens behind the surface.",
      gateCopy: "You are about to unlock:",
      gateNoSpam: "This is not a newsletter. No spam. Only real updates.",
      email: "Email",
      name: "Name, optional",
      unlock: "Unlock",
      emailError: "Enter a valid email to continue.",
      welcome: "Welcome.",
      livePreview: "Live preview",
      livePreviewCopy: "A glimpse of what is being built now.",
      openLive: "Open Live Build",
      followTitle: "Follow the journey.",
      followCopy: "New systems are built every week.",
      currentBuild: "Current Build",
      currentOperator: "Current Operator",
      currentProject: "Current Project",
      progress: "Progress",
      latestDeployment: "Latest deployment",
      estimated: "Estimated completion",
      liveTitle: "Live build signal.",
      liveText: "A quiet window into what DONEOVERNIGHT is building, shipping, and learning.",
      today: "Today's Progress",
      wins: "Latest Wins",
      finished: "Recently Finished",
      upcoming: "Upcoming Builds",
      viewerTitle: "What should DONEOVERNIGHT build next?",
      idea: "Idea",
      description: "Description",
      website: "Website, optional",
      submitIdea: "Submit idea",
      ideaSaved: "Idea saved locally for the next community builds layer."
    },
    nl: {
      navLive: "Live",
      navStory: "Experience",
      scroll: "Scroll",
      step: "Stap",
      entryKicker: "DONEOVERNIGHT",
      entryTitle: "Elk bedrijf wordt uiteindelijk software.",
      entryText: "Laten we laten zien hoe.",
      discover: "Hoe ontdekte je DONEOVERNIGHT?",
      interests: "Wat trekt je het meest?",
      multiple: "Kies alles wat je aandacht trekt.",
      storyTitle: "We verkopen geen AI. We bouwen besturingssystemen.",
      storyCopy: "Het waardevolle deel is niet een model. Het is hoe werk beweegt.",
      oldWorkflow: "Oude workflow",
      newWorkflow: "Verbonden workflow",
      workflowTitle: "Workflow wordt zichtbaar.",
      examples: "Kies een wereld.",
      operatorQuestion: "Wat maakt iemand een operator?",
      operatorCopy: "Geen foute antwoorden. Het patroon telt meer dan de score.",
      reflectionOne: "Waar sta je vandaag?",
      reflectionTwo: "Wat zou je als eerste automatiseren?",
      otherPlaceholder: "Typ je eigen antwoord",
      gateTitle: "Ontgrendel wat er achter de schermen gebeurt.",
      gateCopy: "Je staat op het punt dit te ontgrendelen:",
      gateNoSpam: "Dit is geen nieuwsbrief. Geen spam. Alleen echte updates.",
      email: "E-mail",
      name: "Naam, optioneel",
      unlock: "Ontgrendel",
      emailError: "Voer een geldig e-mailadres in om door te gaan.",
      welcome: "Welkom.",
      livePreview: "Live preview",
      livePreviewCopy: "Een glimp van wat nu wordt gebouwd.",
      openLive: "Open Live Build",
      followTitle: "Volg de reis.",
      followCopy: "Elke week worden nieuwe systemen gebouwd.",
      currentBuild: "Huidige build",
      currentOperator: "Huidige operator",
      currentProject: "Huidig project",
      progress: "Voortgang",
      latestDeployment: "Laatste deployment",
      estimated: "Geschatte oplevering",
      liveTitle: "Live build signaal.",
      liveText: "Een rustig venster op wat DONEOVERNIGHT bouwt, shipped en leert.",
      today: "Voortgang vandaag",
      wins: "Laatste wins",
      finished: "Recent afgerond",
      upcoming: "Aankomende builds",
      viewerTitle: "Wat moet DONEOVERNIGHT hierna bouwen?",
      idea: "Idee",
      description: "Beschrijving",
      website: "Website, optioneel",
      submitIdea: "Verstuur idee",
      ideaSaved: "Idee lokaal opgeslagen voor de volgende community builds laag."
    }
  };

  const data = {
    discover: {
      en: ["TikTok", "Instagram", "Someone sent me", "Google", "Business owner", "Just curious"],
      nl: ["TikTok", "Instagram", "Iemand stuurde me dit", "Google", "Ondernemer", "Gewoon nieuwsgierig"]
    },
    interests: {
      en: ["AI", "Automation", "Architecture", "Business", "Systems", "Operators", "Design", "Execution"],
      nl: ["AI", "Automatisering", "Architectuur", "Business", "Systemen", "Operators", "Design", "Executie"]
    },
    story: {
      en: [
        ["01", "A request enters."],
        ["02", "The system understands the shape."],
        ["03", "Automation moves the obvious parts."],
        ["04", "AI helps with context."],
        ["05", "An operator makes the call."],
        ["06", "Execution becomes visible."]
      ],
      nl: [
        ["01", "Een request komt binnen."],
        ["02", "Het systeem begrijpt de vorm."],
        ["03", "Automatisering beweegt het voor de hand liggende."],
        ["04", "AI helpt met context."],
        ["05", "Een operator neemt de beslissing."],
        ["06", "Executie wordt zichtbaar."]
      ]
    },
    oldFlow: {
      en: ["Website", "Email", "CRM", "Manual work", "Forgotten"],
      nl: ["Website", "E-mail", "CRM", "Handwerk", "Vergeten"]
    },
    newFlow: {
      en: ["Website", "Automation", "AI", "Operator", "Execution", "Client"],
      nl: ["Website", "Automatisering", "AI", "Operator", "Executie", "Client"]
    },
    examples: {
      restaurant: {
        en: ["Restaurant", "Reservations, menus, reviews, events, and supplier questions become one operating rhythm."],
        nl: ["Restaurant", "Reserveringen, menu's, reviews, events en leveranciersvragen worden een ritme."]
      },
      agency: {
        en: ["Agency", "Leads, briefs, scopes, assets, approvals, and delivery stop living across six tabs."],
        nl: ["Agency", "Leads, briefs, scopes, assets, approvals en delivery leven niet meer verspreid."]
      },
      construction: {
        en: ["Construction", "Requests, site photos, planning changes, materials, and client updates become traceable."],
        nl: ["Bouw", "Aanvragen, werffoto's, planning, materialen en klantupdates worden traceerbaar."]
      },
      healthcare: {
        en: ["Healthcare", "Intake, scheduling, follow-up, documents, and internal routing become calmer."],
        nl: ["Zorg", "Intake, planning, opvolging, documenten en interne routing worden rustiger."]
      },
      ecommerce: {
        en: ["E-commerce", "Products, campaigns, support, fulfillment signals, and content move together."],
        nl: ["E-commerce", "Producten, campagnes, support, fulfillment signalen en content bewegen samen."]
      }
    },
    quiz: {
      traits: {
        ownership: { en: "Ownership", nl: "Eigenaarschap" },
        consistency: { en: "Consistency", nl: "Consistentie" },
        curiosity: { en: "Curiosity", nl: "Nieuwsgierigheid" },
        taste: { en: "Taste", nl: "Smaak" },
        decisions: { en: "Decision making", nl: "Besluitvorming" },
        creativity: { en: "Creativity", nl: "Creativiteit" }
      },
      results: {
        ownership: { en: "You naturally think like an operator.", nl: "Je denkt van nature als een operator." },
        taste: { en: "You solve problems like a designer.", nl: "Je lost problemen op als een designer." },
        decisions: { en: "You think in systems.", nl: "Je denkt in systemen." },
        creativity: { en: "You enjoy building.", nl: "Je houdt van bouwen." },
        curiosity: { en: "You follow the signal before others see it.", nl: "Je volgt het signaal voordat anderen het zien." },
        consistency: { en: "You make momentum repeatable.", nl: "Je maakt momentum herhaalbaar." }
      }
    },
    today: {
      en: ["Mapped viewer build intake", "Refined bilingual experience layer", "Prepared live status modules"],
      nl: ["Viewer build intake uitgewerkt", "Tweetalige experience laag verfijnd", "Live status modules voorbereid"]
    },
    wins: {
      en: ["New topic architecture shipped", "Mobile story flow verified", "Email gate ready for CRM connection"],
      nl: ["Nieuwe topic architectuur live", "Mobiele story flow geverifieerd", "Email gate klaar voor CRM koppeling"]
    },
    finished: {
      en: ["Systems pages", "Operator application routing", "Ask subdomain flow"],
      nl: ["Systeempagina's", "Operator apply routing", "Ask subdomein flow"]
    },
    upcoming: {
      en: ["Public build log", "Community voting", "Operator journal"],
      nl: ["Publieke build log", "Community voting", "Operator journal"]
    },
    gateItems: {
      en: ["Behind-the-scenes builds", "Live project updates", "Operator journal", "Viewer Builds", "Architecture breakdowns", "New systems before they are public"],
      nl: ["Behind-the-scenes builds", "Live project updates", "Operator journal", "Viewer Builds", "Architectuur breakdowns", "Nieuwe systemen voordat ze publiek zijn"]
    },
    reflections: {
      en: ["Building my first project", "Growing a business", "Looking for automation", "Learning AI", "Just exploring", "Planning something bigger"],
      nl: ["Mijn eerste project bouwen", "Een bedrijf laten groeien", "Op zoek naar automatisering", "AI leren", "Gewoon verkennen", "Iets groters plannen"]
    },
    automate: {
      en: ["Lead generation", "Emails", "Sales", "Administration", "Content", "CRM", "Scheduling", "Customer support", "Other"],
      nl: ["Leadgeneratie", "E-mails", "Sales", "Administratie", "Content", "CRM", "Planning", "Klantenservice", "Anders"]
    }
  };

  const live = {
    build: "Interactive operating system",
    operator: "DONEOVERNIGHT Studio",
    project: "Public experience layer",
    repository: "doneovernight.com",
    deployment: "Preview verified",
    completion: "Tonight",
    progress: 68
  };

  document.addEventListener("DOMContentLoaded", () => {
    applyLanguage();
    mountHowItWorks();
    mountLive();
    bindLanguage();
    revealOnScroll();
  });

  function mountHowItWorks() {
    if (!document.body.dataset.experience) return;
    mountChoices("discover-grid", data.discover[lang], "discover", false);
    mountChoices("interest-grid", data.interests[lang], "interests", true);
    mountStory();
    mountWorkflow();
    mountExamples();
    mountQuiz();
    mountChoices("reflection-grid", data.reflections[lang], "reflection", false);
    mountChoices("automate-grid", data.automate[lang], "automate", true);
    mountGate();
    mountLivePreview();
  }

  function mountLive() {
    if (!document.body.dataset.live) return;
    fill("[data-live='build']", live.build);
    fill("[data-live='operator']", live.operator);
    fill("[data-live='project']", live.project);
    fill("[data-live='repository']", live.repository);
    fill("[data-live='deployment']", live.deployment);
    fill("[data-live='completion']", live.completion);
    const bar = document.querySelector("[data-live-progress]");
    if (bar) bar.style.width = `${live.progress}%`;
    mountList("today-list", data.today[lang]);
    mountList("wins-list", data.wins[lang]);
    mountList("finished-list", data.finished[lang]);
    mountList("upcoming-list", data.upcoming[lang]);
    mountViewerBuilds();
  }

  function mountChoices(id, items, key, multi) {
    const root = document.getElementById(id);
    if (!root) return;
    const selected = multi ? new Set(state[key] || []) : new Set(state[key] ? [state[key]] : []);
    root.innerHTML = items.map((item, index) => `<button class="choice-card ${selected.has(item) ? "is-selected" : ""}" type="button" data-value="${escapeAttr(item)}" data-index="${index}"><span>${item}</span><span></span></button>`).join("");
    root.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        const value = button.dataset.value;
        if (multi) {
          const next = new Set(state[key] || []);
          next.has(value) ? next.delete(value) : next.add(value);
          state[key] = Array.from(next);
          button.classList.toggle("is-selected");
        } else {
          state[key] = value;
          root.querySelectorAll("button").forEach((item) => item.classList.remove("is-selected"));
          button.classList.add("is-selected");
        }
        save(storageKey, state);
      });
    });
  }

  function mountStory() {
    const root = document.getElementById("story-lines");
    if (!root) return;
    root.innerHTML = data.story[lang].map(([n, text]) => `<div class="story-line reveal"><strong>${n}</strong><span>${text}</span></div>`).join("");
  }

  function mountWorkflow() {
    mountFlow("old-flow", data.oldFlow[lang]);
    mountFlow("new-flow", data.newFlow[lang]);
  }

  function mountFlow(id, items) {
    const root = document.getElementById(id);
    if (!root) return;
    root.innerHTML = items.map((item, index) => `<div class="flow-node" style="animation-delay:${index * 0.18}s">${item}</div>`).join("");
  }

  function mountExamples() {
    const tabs = document.getElementById("example-tabs");
    const board = document.getElementById("example-board");
    if (!tabs || !board) return;
    const keys = Object.keys(data.examples);
    const active = state.example || keys[0];
    tabs.innerHTML = keys.map((key) => `<button class="tab-pill ${key === active ? "is-active" : ""}" type="button" data-example="${key}">${data.examples[key][lang][0]}</button>`).join("");
    renderExample(active);
    tabs.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        state.example = button.dataset.example;
        save(storageKey, state);
        tabs.querySelectorAll("button").forEach((item) => item.classList.remove("is-active"));
        button.classList.add("is-active");
        renderExample(button.dataset.example);
      });
    });
    function renderExample(key) {
      const [title, text] = data.examples[key][lang];
      board.innerHTML = `<h3>${title}</h3><p>${text}</p>`;
      board.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 360, easing: "ease-out" });
    }
  }

  function mountQuiz() {
    const root = document.getElementById("quiz-options");
    const result = document.getElementById("quiz-result");
    if (!root || !result) return;
    const traits = Object.entries(data.quiz.traits);
    root.innerHTML = traits.map(([key, value]) => `<button class="quiz-option" type="button" data-trait="${key}">${value[lang]}</button>`).join("");
    root.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        const trait = button.dataset.trait;
        state.operatorTrait = trait;
        save(storageKey, state);
        result.classList.add("is-visible");
        result.innerHTML = `<h3>${data.quiz.results[trait][lang]}</h3><p class="step-copy">${copy[lang].operatorCopy}</p>`;
        result.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 380, easing: "ease-out" });
      });
    });
  }

  function mountGate() {
    const list = document.getElementById("gate-list");
    const form = document.getElementById("email-form");
    const note = document.getElementById("email-note");
    const after = document.querySelectorAll("[data-after-gate]");
    if (list) list.innerHTML = data.gateItems[lang].map((item) => `<li>${item}</li>`).join("");
    if (savedEmail) after.forEach((node) => { node.hidden = false; });
    if (!form) return;
    form.email.placeholder = copy[lang].email;
    form.name.placeholder = copy[lang].name;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const email = form.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        note.textContent = copy[lang].emailError;
        note.classList.remove("is-success");
        return;
      }
      const payload = { email, name: form.name.value.trim(), lang, createdAt: new Date().toISOString(), state };
      save(emailKey, payload);
      note.textContent = copy[lang].welcome;
      note.classList.add("is-success");
      if (after.length) {
        after.forEach((node) => { node.hidden = false; });
        setTimeout(() => after[0].scrollIntoView({ behavior: "smooth", block: "start" }), 900);
      }
    });
  }

  function mountLivePreview() {
    fill("[data-preview='build']", live.build);
    fill("[data-preview='operator']", live.operator);
    fill("[data-preview='project']", live.project);
    fill("[data-preview='deployment']", live.deployment);
    fill("[data-preview='completion']", live.completion);
    const bar = document.querySelector("[data-preview-progress]");
    if (bar) bar.style.width = `${live.progress}%`;
  }

  function mountViewerBuilds() {
    const form = document.getElementById("viewer-form");
    const note = document.getElementById("viewer-note");
    if (!form) return;
    form.idea.placeholder = copy[lang].idea;
    form.description.placeholder = copy[lang].description;
    form.website.placeholder = copy[lang].website;
    form.email.placeholder = copy[lang].email;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const builds = read("doneovernight.viewerBuilds.v1", []);
      builds.push({
        idea: form.idea.value.trim(),
        description: form.description.value.trim(),
        website: form.website.value.trim(),
        email: form.email.value.trim(),
        createdAt: new Date().toISOString()
      });
      save("doneovernight.viewerBuilds.v1", builds);
      form.reset();
      if (note) {
        note.textContent = copy[lang].ideaSaved;
        note.classList.add("is-success");
      }
    });
  }

  function applyLanguage() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const value = copy[lang][node.dataset.i18n];
      if (value) node.textContent = value;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
      const value = copy[lang][node.dataset.i18nPlaceholder];
      if (value) node.setAttribute("placeholder", value);
    });
    document.querySelectorAll("[data-lang]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.lang === lang);
    });
  }

  function bindLanguage() {
    document.querySelectorAll("[data-lang]").forEach((button) => {
      button.addEventListener("click", () => {
        lang = button.dataset.lang;
        state.lang = lang;
        save(storageKey, state);
        applyLanguage();
        mountHowItWorks();
        mountLive();
        revealOnScroll();
      });
    });
  }

  function revealOnScroll() {
    const items = document.querySelectorAll(".reveal, .story-line");
    if (!("IntersectionObserver" in window)) {
      items.forEach((item) => item.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    }, { threshold: 0.18 });
    items.forEach((item) => observer.observe(item));
  }

  function mountList(id, items) {
    const root = document.getElementById(id);
    if (!root) return;
    root.innerHTML = items.map((item) => `<li>${item}</li>`).join("");
  }

  function fill(selector, value) {
    const node = document.querySelector(selector);
    if (node) node.textContent = value;
  }

  function detectLang() {
    return (navigator.language || "").toLowerCase().startsWith("nl") ? "nl" : "en";
  }

  function read(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {}
  }

  function escapeAttr(value) {
    return String(value).replace(/"/g, "&quot;");
  }
})();
