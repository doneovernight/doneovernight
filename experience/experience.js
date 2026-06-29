(() => {
  const storageKey = "doneovernight.experience.v1";
  const emailKey = "doneovernight.experience.email.v1";
  const confirmationCooldownKey = "doneovernight.experience.confirmationCooldown.v1";
  const state = read(storageKey, {});
  const savedEmail = read(emailKey, null);
  const progressKey = "doneovernight.visitorProgress.v1";
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
      unlockToast: "Unlocked",
      welcomeBack: "Welcome back.",
      continueJourney: "Continue your journey.",
      examples: "Choose a world.",
      operatorQuestion: "What makes an operator?",
      operatorCopy: "No wrong answers. The pattern matters more than the score.",
      reflectionOne: "Where are you today?",
      reflectionTwo: "What would you automate first?",
      otherPlaceholder: "Type your own answer",
      gateTitle: "Join the build journal.",
      gateCopy: "Unlock the private layer of what DONEOVERNIGHT is building.",
      gateNoSpam: "Not a newsletter. A quiet build journal for people who want to see systems before they are public.",
      email: "Email",
      name: "Name, optional",
      social: "TikTok / Instagram handle",
      socialPlaceholder: "@yourname",
      unlock: "Unlock",
      continue: "Continue",
      emailError: "Enter a valid email to continue.",
      emailSending: "Sending access...",
      emailSendFailed: "Confirmation email could not be sent. Try again.",
      emailPendingCopy: "Your access is saved. Email delivery is not connected yet.",
      emailConfirmedTitle: "You're in.",
      emailConfirmedHeadline: "Check your inbox.",
      emailConfirmedCopy: "Your DONEOVERNIGHT access has been sent.",
      liveUnlocked: "Live unlocked",
      resourcesUnlocked: "Resources unlocked",
      viewerUnlocked: "Viewer Builds unlocked",
      journalUnlocked: "Journal unlocked",
      goLive: "Go to Live",
      openResources: "Open Resources",
      submitViewerBuild: "Submit Viewer Build",
      sendAgain: "Send again",
      sendAgainWait: "Send again in",
      sentAgain: "Sent again.",
      welcome: "Welcome.",
      pathTitle: "Welcome.",
      pathCopy: "Choose your path.",
      recommendationsCopy: "A few routes are worth opening next.",
      livePreview: "Live preview",
      livePreviewCopy: "A glimpse of what is being built now.",
      openLive: "Open Live Build",
      followTitle: "Follow the journey.",
      followCopy: "New systems are built every week.",
      followCardTitle: "We build in public.",
      followCardCopy: "Follow the journey.",
      currentBuild: "Current Build",
      currentOperator: "Current Operator",
      currentProject: "Current Project",
      progress: "Progress",
      latestDeployment: "Latest deployment",
      estimated: "Estimated completion",
      lastUpdate: "Last Update",
      currentFocus: "Current Focus",
      placeholder: "Placeholder until connected",
      liveTitle: "Live build signal.",
      liveText: "A quiet window into what DONEOVERNIGHT is building, shipping, and learning. Live data connects here next.",
      today: "Today's Progress",
      recentActivity: "Recent Activity",
      wins: "Latest Wins",
      finished: "Recently Finished",
      upcoming: "Upcoming Builds",
      viewerTitle: "What should DONEOVERNIGHT build next?",
      idea: "Idea",
      description: "Description",
      website: "Website, optional",
      submitIdea: "Submit idea",
      ideaSaved: "Your idea has been added.",
      copyResult: "Copy your result",
      sharePage: "Share this page",
      copied: "Copied",
      linkCopied: "Link copied",
      nextLive: "Next: Live Build",
      nextViewer: "Next: Viewer Builds",
      nextFollow: "Next: Follow the journey",
      dmIdea: "DM us your build idea",
      solvePlaceholder: "What would this solve for you?",
      journeyComplete: "Journey Complete.",
      platformWelcome: "Welcome to DONEOVERNIGHT.",
      unlockedExperience: "Experience unlocked",
      unlockedLive: "Live Builds unlocked",
      unlockedViewer: "Viewer Builds unlocked",
      unlockedJournal: "Build Journal unlocked",
      unlockedResources: "Resources unlocked",
      earlyBuilder: "You are now one of the early builders.",
      journeyId: "Journey ID",
      journeyStarted: "Journey started",
      completion: "Completion",
      chosenPath: "Chosen Path",
      chosenInterests: "Chosen Interests",
      result: "Result",
      openPlatform: "Open platform",
      platformHub: "Platform Hub",
      platformHubTitle: "DONEOVERNIGHT Headquarters.",
      platformHubCopy: "Choose the next room.",
      hubLive: "Live Builds",
      hubLiveCopy: "Current signal and status.",
      hubJournal: "Build Journal",
      hubJournalCopy: "Operator notes in sequence.",
      hubResources: "Resources",
      hubResourcesCopy: "Future systems and tools.",
      hubViewer: "Viewer Builds",
      hubViewerCopy: "Submit what should be built next.",
      hubAsk: "Ask DONEOVERNIGHT",
      hubAskCopy: "Open the request layer.",
      resourcesNav: "Resources",
      journalNav: "Journal",
      resourcesTitle: "Platform resources.",
      resourcesText: "A quiet room for the systems, tools, and operating assets that will plug into DONEOVERNIGHT.",
      enterPlatform: "Enter platform",
      journalTitle: "Operator journal.",
      journalText: "Not a blog. A chronological signal of what changed, what shipped, and what is being prepared.",
      liveBuilds: "Live Builds"
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
      unlockToast: "Ontgrendeld",
      welcomeBack: "Welkom terug.",
      continueJourney: "Ga verder.",
      examples: "Kies een wereld.",
      operatorQuestion: "Wat maakt iemand een operator?",
      operatorCopy: "Geen foute antwoorden. Het patroon telt meer dan de score.",
      reflectionOne: "Waar sta je vandaag?",
      reflectionTwo: "Wat zou je als eerste automatiseren?",
      otherPlaceholder: "Typ je eigen antwoord",
      gateTitle: "Word onderdeel van het build journal.",
      gateCopy: "Ontgrendel de private laag van wat DONEOVERNIGHT bouwt.",
      gateNoSpam: "Geen nieuwsbrief. Een rustig build journal voor mensen die systemen willen zien voordat ze publiek zijn.",
      email: "E-mail",
      name: "Naam, optioneel",
      social: "TikTok / Instagram handle",
      socialPlaceholder: "@jouwnaam",
      unlock: "Ontgrendel",
      continue: "Ga verder",
      emailError: "Voer een geldig e-mailadres in om door te gaan.",
      emailSending: "Toegang wordt verzonden...",
      emailSendFailed: "De bevestiging kon niet worden verzonden. Probeer opnieuw.",
      emailPendingCopy: "Je toegang is opgeslagen. E-mailbezorging is nog niet gekoppeld.",
      emailConfirmedTitle: "Je bent binnen.",
      emailConfirmedHeadline: "Check je inbox.",
      emailConfirmedCopy: "Je DONEOVERNIGHT toegang is verzonden.",
      liveUnlocked: "Live ontgrendeld",
      resourcesUnlocked: "Resources ontgrendeld",
      viewerUnlocked: "Viewer Builds ontgrendeld",
      journalUnlocked: "Journal ontgrendeld",
      goLive: "Ga naar Live",
      openResources: "Open Resources",
      submitViewerBuild: "Submit Viewer Build",
      sendAgain: "Opnieuw verzenden",
      sendAgainWait: "Opnieuw verzenden over",
      sentAgain: "Opnieuw verzonden.",
      welcome: "Welkom.",
      pathTitle: "Welkom.",
      pathCopy: "Kies je pad.",
      recommendationsCopy: "Een paar routes zijn het openen waard.",
      livePreview: "Live preview",
      livePreviewCopy: "Een glimp van wat nu wordt gebouwd.",
      openLive: "Open Live Build",
      followTitle: "Volg de reis.",
      followCopy: "Elke week worden nieuwe systemen gebouwd.",
      followCardTitle: "We bouwen publiek.",
      followCardCopy: "Volg de reis.",
      currentBuild: "Huidige build",
      currentOperator: "Huidige operator",
      currentProject: "Huidig project",
      progress: "Voortgang",
      latestDeployment: "Laatste deployment",
      estimated: "Geschatte oplevering",
      lastUpdate: "Laatste update",
      currentFocus: "Huidige focus",
      placeholder: "Placeholder tot gekoppeld",
      liveTitle: "Live build signaal.",
      liveText: "Een rustig venster op wat DONEOVERNIGHT bouwt, shipped en leert. Live data wordt hierna gekoppeld.",
      today: "Voortgang vandaag",
      recentActivity: "Recente activiteit",
      wins: "Laatste wins",
      finished: "Recent afgerond",
      upcoming: "Aankomende builds",
      viewerTitle: "Wat moet DONEOVERNIGHT hierna bouwen?",
      idea: "Idee",
      description: "Beschrijving",
      website: "Website, optioneel",
      submitIdea: "Verstuur idee",
      ideaSaved: "Je idee is toegevoegd.",
      copyResult: "Kopieer je resultaat",
      sharePage: "Deel deze pagina",
      copied: "Gekopieerd",
      linkCopied: "Link gekopieerd",
      nextLive: "Volgende: Live Build",
      nextViewer: "Volgende: Viewer Builds",
      nextFollow: "Volgende: volg de reis",
      dmIdea: "DM ons je build idee",
      solvePlaceholder: "Wat zou dit voor je oplossen?",
      journeyComplete: "Reis voltooid.",
      platformWelcome: "Welkom bij DONEOVERNIGHT.",
      unlockedExperience: "Experience ontgrendeld",
      unlockedLive: "Live Builds ontgrendeld",
      unlockedViewer: "Viewer Builds ontgrendeld",
      unlockedJournal: "Build Journal ontgrendeld",
      unlockedResources: "Resources ontgrendeld",
      earlyBuilder: "Je bent nu een van de early builders.",
      journeyId: "Journey ID",
      journeyStarted: "Reis gestart",
      completion: "Voltooiing",
      chosenPath: "Gekozen pad",
      chosenInterests: "Gekozen interesses",
      result: "Resultaat",
      openPlatform: "Open platform",
      platformHub: "Platform Hub",
      platformHubTitle: "DONEOVERNIGHT Headquarters.",
      platformHubCopy: "Kies de volgende ruimte.",
      hubLive: "Live Builds",
      hubLiveCopy: "Huidig signaal en status.",
      hubJournal: "Build Journal",
      hubJournalCopy: "Operator notes in volgorde.",
      hubResources: "Resources",
      hubResourcesCopy: "Toekomstige systemen en tools.",
      hubViewer: "Viewer Builds",
      hubViewerCopy: "Stuur in wat hierna gebouwd moet worden.",
      hubAsk: "Ask DONEOVERNIGHT",
      hubAskCopy: "Open de request laag.",
      resourcesNav: "Resources",
      journalNav: "Journal",
      resourcesTitle: "Platform resources.",
      resourcesText: "Een rustige ruimte voor systemen, tools en operating assets die in DONEOVERNIGHT passen.",
      enterPlatform: "Open platform",
      journalTitle: "Operator journal.",
      journalText: "Geen blog. Een chronologisch signaal van wat is veranderd, shipped en voorbereid.",
      liveBuilds: "Live Builds"
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
      en: ["Waiting for live activity feed", "GitHub connection pending", "Internal status API pending"],
      nl: ["Wachten op live activity feed", "GitHub koppeling pending", "Interne status API pending"]
    },
    wins: {
      en: ["Live wins will appear here", "Deployment events will appear here", "Operator notes will appear here"],
      nl: ["Live wins verschijnen hier", "Deployment events verschijnen hier", "Operator notes verschijnen hier"]
    },
    finished: {
      en: ["Recently finished builds will appear here", "Client-ready systems will appear here", "Public releases will appear here"],
      nl: ["Recent afgeronde builds verschijnen hier", "Client-ready systemen verschijnen hier", "Publieke releases verschijnen hier"]
    },
    upcoming: {
      en: ["Upcoming builds will appear here", "Viewer Builds voting will appear here", "Operator Journal entries will appear here"],
      nl: ["Aankomende builds verschijnen hier", "Viewer Builds voting verschijnt hier", "Operator Journal entries verschijnen hier"]
    },
    gateItems: {
      en: ["Live Builds", "Operator Journal", "Viewer Builds", "Private updates", "New systems before they are public", "Architecture breakdowns"],
      nl: ["Live Builds", "Operator Journal", "Viewer Builds", "Private updates", "Nieuwe systemen voordat ze publiek zijn", "Architectuur breakdowns"]
    },
    reflections: {
      en: ["Building my first project", "Growing a business", "Looking for automation", "Learning AI", "Just exploring", "Planning something bigger"],
      nl: ["Mijn eerste project bouwen", "Een bedrijf laten groeien", "Op zoek naar automatisering", "AI leren", "Gewoon verkennen", "Iets groters plannen"]
    },
    automate: {
      en: ["Lead generation", "Emails", "Sales", "Administration", "Content", "CRM", "Scheduling", "Customer support", "Other"],
      nl: ["Leadgeneratie", "E-mails", "Sales", "Administratie", "Content", "CRM", "Planning", "Klantenservice", "Anders"]
    },
    paths: {
      en: ["Business Owner", "Operator", "Builder", "Just Curious"],
      nl: ["Business owner", "Operator", "Builder", "Gewoon nieuwsgierig"]
    },
    summaries: {
      en: [
        "You think like an operator.",
        "You naturally think in systems.",
        "You care about execution.",
        "You enjoy building.",
        "You solve before you speak.",
        "You think long term.",
        "You look for the hidden workflow.",
        "You notice where work gets stuck."
      ],
      nl: [
        "Je denkt als een operator.",
        "Je denkt van nature in systemen.",
        "Je geeft om executie.",
        "Je houdt van bouwen.",
        "Je lost op voordat je praat.",
        "Je denkt op lange termijn.",
        "Je ziet de verborgen workflow.",
        "Je merkt waar werk vastloopt."
      ]
    },
    summarySupport: {
      en: [
        "Your answers point toward structure, movement, and practical leverage.",
        "You followed the parts where ideas become operating systems.",
        "The useful next step is not more information. It is seeing what can be built.",
        "You seem drawn to the layer where judgment and systems meet."
      ],
      nl: [
        "Je antwoorden wijzen naar structuur, beweging en praktische leverage.",
        "Je volgde de delen waar ideeën besturingssystemen worden.",
        "De nuttige volgende stap is niet meer informatie. Het is zien wat gebouwd kan worden.",
        "Je lijkt te kijken naar de laag waar oordeel en systemen elkaar raken."
      ]
    },
    recommendations: {
      business_owner: ["Systems", "Automation", "Business", "Live"],
      operator: ["Operators", "Systems", "Live", "Architecture"],
      builder: ["AI", "Architecture", "Systems", "Viewer Builds"],
      curious: ["Systems", "Automation", "AI", "Business", "Architecture", "Operators", "Live", "Viewer Builds"]
    },
    recommendationLabels: {
      en: {
        "AI": "AI",
        "Architecture": "Architecture",
        "Automation": "Automation",
        "Business": "Business",
        "Live": "Live",
        "Operators": "Operators",
        "Systems": "Systems",
        "Viewer Builds": "Viewer Builds"
      },
      nl: {
        "AI": "AI",
        "Architecture": "Architectuur",
        "Automation": "Automatisering",
        "Business": "Business",
        "Live": "Live",
        "Operators": "Operators",
        "Systems": "Systemen",
        "Viewer Builds": "Viewer Builds"
      }
    }
  };

  const live = {
    build: "Awaiting live connection",
    operator: "Operator feed pending",
    project: "Project feed pending",
    repository: "doneovernight.com",
    branch: "main",
    commit: "Pending live commit",
    heartbeat: "Waiting for heartbeat",
    repositoryStatus: "Repository connection pending",
    deployment: "Deployment feed pending",
    completion: "Estimate pending",
    lastUpdate: "No live update connected",
    focus: "Connect live data",
    progress: 22,
    progressLabel: "Pending"
  };

  const progression = {
    first: 1,
    discover: 2,
    interests: 3,
    story: 4,
    workflow: 5,
    example: 6,
    operatorTrait: 7,
    reflection: 8,
    automate: 9,
    gate: 10,
    path: 11,
    recommendations: 12,
    livePreview: 13,
    viewerBuilds: 14
  };

  const progressTotal = 10;
  let renderedActiveStep = null;
  let activeStepReadyAt = Date.now();

  document.addEventListener("DOMContentLoaded", () => {
    applyLanguage();
    mountHowItWorks();
    mountLive();
    bindLanguage();
    revealOnScroll();
  });

  function mountHowItWorks() {
    if (!document.body.dataset.experience) return;
    normalizeProgress();
    ensureJourney();
    mountChoices("discover-grid", data.discover[lang], "discover", false);
    mountChoices("interest-grid", data.interests[lang], "interests", true);
    mountStory();
    mountWorkflow();
    mountExamples();
    mountQuiz();
    mountChoices("reflection-grid", data.reflections[lang], "reflection", false);
    mountChoices("automate-grid", data.automate[lang], "automate", true);
    mountAutomationOther();
    mountGate();
    mountLivePreview();
    mountViewerBuilds();
    mountPaths();
    renderPersonalResult();
    bindResultActions();
    bindNextUnlocks();
    bindChoiceContinues();
    bindPlatformHub();
    renderProgress();
    renderReturnVisitor();
    renderPassport();
    persistVisitorProgress();
    applyUnlockedSteps();
    bindAutoUnlocks();
  }

  function mountLive() {
    if (!document.body.dataset.live) return;
    fill("[data-live='build']", live.build);
    fill("[data-live='operator']", live.operator);
    fill("[data-live='project']", live.project);
    fill("[data-live='repository']", live.repository);
    fill("[data-live='branch']", live.branch);
    fill("[data-live='commit']", live.commit);
    fill("[data-live='heartbeat']", live.heartbeat);
    fill("[data-live='repositoryStatus']", live.repositoryStatus);
    fill("[data-live='deployment']", live.deployment);
    fill("[data-live='completion']", live.completion);
    fill("[data-live='lastUpdate']", live.lastUpdate);
    fill("[data-live='focus']", live.focus);
    fill("[data-live='progressLabel']", live.progressLabel);
    const bar = document.querySelector("[data-live-progress]");
    if (bar) bar.style.width = `${live.progress}%`;
    mountList("today-list", data.today[lang]);
    mountList("wins-list", data.wins[lang]);
    mountList("finished-list", data.finished[lang]);
    mountList("upcoming-list", data.upcoming[lang]);
    mountViewerBuilds();
    renderProgress();
  }

  function mountChoices(id, items, key, multi) {
    const root = document.getElementById(id);
    if (!root) return;
    const stableKey = `${key}Keys`;
    const selected = new Set(state[stableKey] || []);
    root.innerHTML = items.map((item, index) => {
      const choiceKey = `${key}:${index}`;
      return `<button class="choice-card ${selected.has(choiceKey) ? "is-selected" : ""}" type="button" data-choice-key="${choiceKey}" data-value="${escapeAttr(item)}" data-index="${index}"><span>${item}</span><span></span></button>`;
    }).join("");
    root.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        const value = button.dataset.value;
        const choiceKey = button.dataset.choiceKey;
        if (multi) {
          const next = new Set(state[stableKey] || []);
          next.has(choiceKey) ? next.delete(choiceKey) : next.add(choiceKey);
          state[stableKey] = Array.from(next);
          state[key] = Array.from(next).map((item) => items[Number(item.split(":")[1])]).filter(Boolean);
          button.classList.toggle("is-selected");
        } else {
          state[stableKey] = [choiceKey];
          state[key] = value;
          root.querySelectorAll("button").forEach((item) => item.classList.remove("is-selected"));
          button.classList.add("is-selected");
          if (progression[key]) completeInteraction(key, progression[key]);
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
    tabs.innerHTML = keys.map((key) => `<button class="tab-pill ${key === state.example ? "is-active" : ""}" type="button" data-example="${key}">${data.examples[key][lang][0]}</button>`).join("");
    renderExample(active);
    tabs.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        state.example = button.dataset.example;
        save(storageKey, state);
        tabs.querySelectorAll("button").forEach((item) => item.classList.remove("is-active"));
        button.classList.add("is-active");
        renderExample(button.dataset.example);
        completeInteraction("example", progression.example);
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
        root.querySelectorAll("button").forEach((item) => item.classList.remove("is-selected"));
        button.classList.add("is-selected");
        result.classList.add("is-visible");
        result.innerHTML = `<h3>${data.quiz.results[trait][lang]}</h3><p class="step-copy">${copy[lang].operatorCopy}</p>`;
        result.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 380, easing: "ease-out" });
        completeInteraction("operatorTrait", progression.operatorTrait);
      });
    });
    if (state.operatorTrait && !data.quiz.results[state.operatorTrait]) {
      state.operatorTrait = "";
      save(storageKey, state);
    }
    if (state.operatorTrait) {
      root.querySelectorAll("button").forEach((button) => {
        button.classList.toggle("is-selected", button.dataset.trait === state.operatorTrait);
      });
      result.classList.add("is-visible");
      result.innerHTML = `<h3>${data.quiz.results[state.operatorTrait][lang]}</h3><p class="step-copy">${copy[lang].operatorCopy}</p>`;
    }
  }

  function mountGate() {
    const list = document.getElementById("gate-list");
    const form = document.getElementById("email-form");
    const note = document.getElementById("email-note");
    const confirmation = document.getElementById("gate-confirmation");
    const confirmationCopy = document.getElementById("email-confirmation-copy");
    const continueButton = document.getElementById("gate-continue");
    const resendButton = document.getElementById("resend-confirmation");
    const resendNote = document.getElementById("resend-note");
    const after = document.querySelectorAll("[data-after-gate]");
    if (list) list.innerHTML = data.gateItems[lang].map((item) => `<li>${item}</li>`).join("");
    if (savedEmail) {
      showGateConfirmation(savedEmail.confirmation || { delivered: true }, false);
      unlockGate(false);
    }
    if (continueButton) {
      continueButton.onclick = () => unlockGate(true);
    }
    if (resendButton) {
      updateResendCooldown(resendButton, resendNote);
      resendButton.onclick = async () => {
        const remaining = resendCooldownRemaining();
        if (remaining > 0) {
          if (resendNote) resendNote.textContent = `${copy[lang].sendAgainWait} ${remaining}s.`;
          return;
        }
        const payload = read(emailKey, null);
        if (!payload?.email) return;
        resendButton.disabled = true;
        if (resendNote) {
          resendNote.textContent = copy[lang].emailSending;
          resendNote.classList.remove("is-success");
        }
        const result = await requestJourneyConfirmation(payload.confirmationPayload || buildJourneyConfirmationPayload(payload));
        payload.confirmation = result;
        save(emailKey, payload);
        save(confirmationCooldownKey, { lastSentAt: Date.now() });
        showGateConfirmation(result, false);
        if (resendNote) {
          resendNote.textContent = result.delivered ? copy[lang].sentAgain : (result.configured === false ? copy[lang].emailPendingCopy : copy[lang].emailSendFailed);
          resendNote.classList.toggle("is-success", result.delivered || result.configured === false);
        }
        updateResendCooldown(resendButton, resendNote);
      };
    }
    if (!form) return;
    form.email.placeholder = copy[lang].email;
    form.name.placeholder = copy[lang].name;
    if (form.social) {
      form.social.placeholder = copy[lang].socialPlaceholder;
      form.social.setAttribute("aria-label", copy[lang].social);
    }
    form.onsubmit = async (event) => {
      event.preventDefault();
      const email = form.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        note.textContent = copy[lang].emailError;
        note.classList.remove("is-success");
        return;
      }
      const submit = form.querySelector('[type="submit"]');
      if (submit) submit.disabled = true;
      note.textContent = copy[lang].emailSending;
      note.classList.remove("is-success");
      const socialHandle = form.social ? form.social.value.trim() : "";
      state.socialHandle = socialHandle;
      save(storageKey, state);
      const confirmationPayload = buildJourneyConfirmationPayload({
        email,
        name: form.name.value.trim(),
        socialHandle
      });
      const confirmationResult = await requestJourneyConfirmation(confirmationPayload);
      if (!confirmationResult.delivered && confirmationResult.configured !== false) {
        note.textContent = copy[lang].emailSendFailed;
        note.classList.remove("is-success");
        if (submit) submit.disabled = false;
        return;
      }
      const payload = {
        email,
        name: form.name.value.trim(),
        socialHandle,
        lang,
        createdAt: new Date().toISOString(),
        confirmation: confirmationResult,
        confirmationPayload,
        interactions: state,
        crmReady: {
          journeyId: state.journeyId || "",
          source: state.discover || "",
          interests: state.interests || [],
          reflection: state.reflection || "",
          automationFirst: state.automate || [],
          automationOther: state.automationOther || "",
          operatorTrait: state.operatorTrait || "",
          example: state.example || "",
          socialHandle
        }
      };
      save(emailKey, payload);
      save(confirmationCooldownKey, { lastSentAt: Date.now() });
      note.textContent = confirmationResult.delivered ? copy[lang].welcome : copy[lang].emailPendingCopy;
      note.classList.add("is-success");
      markComplete("gate");
      persistVisitorProgress();
      showReward();
      showGateConfirmation(confirmationResult, true);
      if (submit) submit.disabled = false;
    };

    function showGateConfirmation(result = {}, scroll = true) {
      if (!confirmation || !form) return;
      const section = confirmation.closest(".experience-step");
      const panel = confirmation.closest(".gate-panel");
      if (section) section.classList.add("has-gate-confirmation");
      if (panel) panel.classList.add("is-confirmed");
      form.hidden = true;
      confirmation.hidden = false;
      if (confirmationCopy) {
        confirmationCopy.textContent = result.delivered ? copy[lang].emailConfirmedCopy : copy[lang].emailPendingCopy;
      }
      if (scroll) setTimeout(() => scrollToPanel(section || confirmation), 120);
      updateResendCooldown(resendButton, resendNote);
    }
  }

  function buildJourneyConfirmationPayload(input = {}) {
    ensureJourney();
    return {
      email: input.email || "",
      name: input.name || "",
      social_handle: input.socialHandle || state.socialHandle || "",
      journey_id: state.journeyId || "",
      chosen_path: state.path || "",
      chosen_interests: state.interests || [],
      result: resolveCurrentResult(),
      source: state.discover || "how_it_works",
      created_at: new Date().toISOString(),
      browser_language: state.browserLanguage || navigator.language || "",
      completion: completionPercent(),
      utm: state.utm || {},
      lang
    };
  }

  async function requestJourneyConfirmation(payload) {
    try {
      const response = await fetch("/api/journey-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      return {
        ...result,
        delivered: result.delivered === true,
        configured: result.configured === true,
        ok: response.ok && result.ok === true,
        statusCode: response.status
      };
    } catch (error) {
      return {
        ok: false,
        delivered: false,
        configured: true,
        provider: "none",
        reason: "network_error"
      };
    }
  }

  function resendCooldownRemaining() {
    const cooldown = read(confirmationCooldownKey, {});
    const elapsed = Math.floor((Date.now() - Number(cooldown.lastSentAt || 0)) / 1000);
    return Math.max(0, 60 - elapsed);
  }

  function updateResendCooldown(button, note) {
    if (!button) return;
    const remaining = resendCooldownRemaining();
    button.disabled = remaining > 0;
    button.textContent = remaining > 0 ? `${copy[lang].sendAgainWait} ${remaining}s` : copy[lang].sendAgain;
    if (remaining > 0) {
      setTimeout(() => updateResendCooldown(button, note), 1000);
    } else if (note && note.textContent.startsWith(copy[lang].sendAgainWait)) {
      note.textContent = "";
    }
  }

  function resolveCurrentResult() {
    if (state.operatorTrait && data.quiz.results[state.operatorTrait]) return data.quiz.results[state.operatorTrait][lang];
    const title = document.getElementById("personal-title")?.textContent || document.getElementById("final-title")?.textContent;
    return title || data.summaries[lang][summarySeed() % data.summaries[lang].length];
  }

  function mountLivePreview() {
    fill("[data-preview='build']", live.build);
    fill("[data-preview='operator']", live.operator);
    fill("[data-preview='project']", live.project);
    fill("[data-preview='deployment']", live.deployment);
    fill("[data-preview='completion']", live.completion);
    fill("[data-preview='progressLabel']", live.progressLabel);
    const bar = document.querySelector("[data-preview-progress]");
    if (bar) bar.style.width = `${live.progress}%`;
  }

  function mountViewerBuilds() {
    const form = document.getElementById("viewer-form");
    const note = document.getElementById("viewer-note");
    if (!form) return;
    const fields = form.elements;
    fields.idea.placeholder = copy[lang].idea;
    fields.description.placeholder = copy[lang].description;
    if (fields.solve) fields.solve.placeholder = copy[lang].solvePlaceholder;
    fields.website.placeholder = copy[lang].website;
    fields.email.placeholder = copy[lang].email;
    form.onsubmit = (event) => {
      event.preventDefault();
      const builds = read("doneovernight.viewerBuilds.v1", []);
      builds.push({
        idea: fields.idea.value.trim(),
        description: fields.description.value.trim(),
        solve: fields.solve ? fields.solve.value.trim() : "",
        website: fields.website.value.trim(),
        email: fields.email.value.trim(),
        createdAt: new Date().toISOString()
      });
      save("doneovernight.viewerBuilds.v1", builds);
      form.reset();
      if (note) {
        note.textContent = copy[lang].ideaSaved;
        note.classList.add("is-success");
      }
      persistVisitorProgress();
      completeInteraction("viewerBuilds", progression.viewerBuilds);
    };
  }

  function mountAutomationOther() {
    const input = document.getElementById("automation-other");
    if (!input) return;
    input.value = state.automationOther || "";
    input.oninput = () => {
      state.automationOther = input.value.trim();
      save(storageKey, state);
    };
  }

  function mountPaths() {
    const root = document.getElementById("path-grid");
    if (!root) return;
    const keys = ["business_owner", "operator", "builder", "curious"];
    root.innerHTML = data.paths[lang].map((label, index) => {
      const key = keys[index];
      return `<button class="choice-card ${state.path === key ? "is-selected" : ""}" type="button" data-path="${key}"><span>${label}</span><span></span></button>`;
    }).join("");
    root.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        state.path = button.dataset.path;
        save(storageKey, state);
        root.querySelectorAll("button").forEach((item) => item.classList.remove("is-selected"));
        button.classList.add("is-selected");
        renderPersonalResult();
        completePath();
      });
    });
  }

  function renderPersonalResult() {
    const title = document.getElementById("personal-title");
    const body = document.getElementById("personal-copy");
    const grid = document.getElementById("recommendation-grid");
    if (!title || !body || !grid) return;
    const summaryIndex = summarySeed() % data.summaries[lang].length;
    const supportIndex = (summarySeed() + 3) % data.summarySupport[lang].length;
    title.textContent = data.summaries[lang][summaryIndex];
    body.textContent = data.summarySupport[lang][supportIndex];
    fill("#final-title", title.textContent);
    fill("#final-copy", body.textContent);
    const labels = recommendationLabels(state.path || "curious");
    grid.innerHTML = labels.map((label) => `<a class="recommendation-card" href="${recommendationHref(label)}"><span>${data.recommendationLabels[lang][label] || label}</span><small>${copy[lang].recommendationsCopy}</small></a>`).join("");
  }

  function ensureJourney() {
    if (!state.journeyId) state.journeyId = `DON-${String(Math.floor(1 + Math.random() * 999999)).padStart(6, "0")}`;
    if (!state.journeyStartedAt) state.journeyStartedAt = new Date().toISOString();
    if (!state.browserLanguage) state.browserLanguage = navigator.language || "";
    const params = new URLSearchParams(location.search);
    state.utm = state.utm || {
      source: params.get("utm_source") || "",
      medium: params.get("utm_medium") || "",
      campaign: params.get("utm_campaign") || "",
      content: params.get("utm_content") || "",
      term: params.get("utm_term") || ""
    };
    state.returned = Boolean(state.returned || (state.completed || []).length);
    save(storageKey, state);
  }

  function renderPassport() {
    fill("#journey-id", state.journeyId || "");
    fill("#journey-started", formatDate(state.journeyStartedAt));
    fill("#journey-completion", `${completionPercent()}%`);
    fill("#journey-path", state.path || "curious");
    fill("#journey-interests", (state.interests || []).join(", ") || "Systems");
    fill("#journey-result", document.getElementById("final-title")?.textContent || "");
  }

  function bindPlatformHub() {
    const button = document.getElementById("open-platform");
    const panel = document.getElementById("completion-panel");
    const hub = document.getElementById("platform-hub");
    if (button && panel && hub) {
      button.onclick = () => {
        panel.hidden = true;
        hub.hidden = false;
        state.platformOpened = true;
        save(storageKey, state);
        persistVisitorProgress();
        hub.animate([{ opacity: 0, transform: "translateY(18px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 420, easing: "ease-out" });
        setTimeout(() => scrollToPanel(hub), 80);
      };
      if (state.platformOpened) {
        panel.hidden = true;
        hub.hidden = false;
      }
    }
    const follow = document.getElementById("follow-journey");
    if (follow) {
      follow.onclick = () => {
        state.followClicked = true;
        save(storageKey, state);
        persistVisitorProgress();
        window.location.href = "https://www.tiktok.com/@doneovernight";
      };
    }
  }

  function completionPercent() {
    return Math.min(100, Math.round(((state.completed || []).length / progressTotal) * 100));
  }

  function scrollToPanel(element) {
    const offset = window.matchMedia("(max-width: 620px)").matches ? 168 : 96;
    const top = element.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  function persistVisitorProgress() {
    const emailPayload = read(emailKey, {});
    const viewerBuilds = read("doneovernight.viewerBuilds.v1", []);
    const latestBuild = viewerBuilds[viewerBuilds.length - 1] || {};
    const started = state.journeyStartedAt ? new Date(state.journeyStartedAt).getTime() : Date.now();
    const payload = {
      journeys: {
        journey_id: state.journeyId || "",
        email: emailPayload.email || "",
        social_handle: state.socialHandle || emailPayload.socialHandle || "",
        source: state.discover || "",
        utm: state.utm || {},
        browser_language: state.browserLanguage || navigator.language || "",
        chosen_path: state.path || "",
        chosen_interests: state.interests || [],
        completion: completionPercent(),
        result: document.getElementById("final-title")?.textContent || "",
        journey_started_at: state.journeyStartedAt || "",
        returned: Boolean(state.returned),
        time_spent: Math.max(0, Math.round((Date.now() - started) / 1000)),
        follow_clicked: Boolean(state.followClicked)
      },
      viewer_builds: {
        journey_id: state.journeyId || "",
        viewer_build: latestBuild.idea || "",
        viewer_problem: latestBuild.solve || "",
        description: latestBuild.description || "",
        website: latestBuild.website || "",
        email: latestBuild.email || ""
      },
      resource_interest: [],
      journal: [],
      live_status: {},
      visitor_progress: {
        journey_id: state.journeyId || "",
        active_step: Number(state.activeStep) || 1,
        unlocked_step: Number(state.unlockedStep) || 1,
        completed: state.completed || [],
        completion: completionPercent()
      }
    };
    save(progressKey, payload);
  }

  function formatDate(value) {
    if (!value) return "";
    try {
      return new Intl.DateTimeFormat(lang === "nl" ? "nl-NL" : "en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
    } catch (error) {
      return value;
    }
  }

  function bindChoiceContinues() {
    document.querySelectorAll("[data-continue-choice]").forEach((button) => {
      button.onclick = () => {
        const key = button.dataset.continueChoice;
        const selected = state[`${key}Keys`] || [];
        if (key === "automate" && state.automationOther) {
          completeInteraction(key, progression[key]);
          return;
        }
        if (selected.length && progression[key]) completeInteraction(key, progression[key]);
      };
    });
  }

  function bindResultActions() {
    const copyButton = document.getElementById("copy-result");
    const shareButton = document.getElementById("share-page");
    if (copyButton) {
      copyButton.onclick = () => {
        const text = resultText();
        copyText(text);
        showReward(copy[lang].copied);
      };
    }
    if (shareButton) {
      shareButton.onclick = async () => {
        const text = resultText();
        const url = `${location.origin}/how-it-works`;
        if (navigator.share) {
          try {
            await navigator.share({ title: "DONEOVERNIGHT", text, url });
            return;
          } catch (error) {}
        }
        copyText(url);
        showReward(copy[lang].linkCopied);
      };
    }
  }

  function bindNextUnlocks() {
    document.querySelectorAll("[data-next-step]").forEach((button) => {
      button.onclick = () => completeInteraction(button.dataset.nextKey, Number(button.dataset.nextStep));
    });
  }

  function resultText() {
    const title = document.getElementById("personal-title")?.textContent || "";
    const body = document.getElementById("personal-copy")?.textContent || "";
    return `${title}\n${body}`.trim();
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
      return;
    }
    fallbackCopy(text);
  }

  function fallbackCopy(text) {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    try { document.execCommand("copy"); } catch (error) {}
    field.remove();
  }

  function recommendationLabels(path) {
    return data.recommendations[path] || data.recommendations.curious;
  }

  function recommendationHref(label) {
    const map = {
      "AI": "/ai",
      "Architecture": "/architecture",
      "Automation": "/automation",
      "Business": "/business",
      "Live": "/live",
      "Operators": "/operators",
      "Systems": "/systems",
      "Viewer Builds": "/live#viewer-builds"
    };
    return map[label] || "/live";
  }

  function summarySeed() {
    const source = [
      state.discover,
      (state.interests || []).join(","),
      state.operatorTrait,
      state.reflection,
      (state.automate || []).join(","),
      state.path
    ].join("|");
    return Array.from(source || "doneovernight").reduce((sum, char) => sum + char.charCodeAt(0), 0);
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

  function normalizeProgress() {
    state.unlockedStep = Math.max(1, Number(state.unlockedStep) || 1);
    const hadActiveStep = Number.isFinite(Number(state.activeStep)) && Number(state.activeStep) > 0;
    state.activeStep = hadActiveStep ? Math.max(1, Number(state.activeStep)) : 1;
    state.completed = Array.isArray(state.completed) ? state.completed : [];
    migrateChoice("discover", data.discover);
    migrateChoice("interests", data.interests);
    migrateChoice("reflection", data.reflections);
    migrateChoice("automate", data.automate);
    if ((state.discoverKeys || []).length) state.unlockedStep = Math.max(state.unlockedStep, progression.discover);
    if ((state.interestsKeys || []).length) state.unlockedStep = Math.max(state.unlockedStep, progression.interests);
    if ((state.completed || []).includes("story")) state.unlockedStep = Math.max(state.unlockedStep, progression.story);
    if ((state.completed || []).includes("workflow")) state.unlockedStep = Math.max(state.unlockedStep, progression.workflow);
    if (state.example) state.unlockedStep = Math.max(state.unlockedStep, progression.example);
    if (state.operatorTrait) state.unlockedStep = Math.max(state.unlockedStep, progression.operatorTrait);
    if ((state.reflectionKeys || []).length) state.unlockedStep = Math.max(state.unlockedStep, progression.reflection);
    if ((state.automateKeys || []).length || state.automationOther) state.unlockedStep = Math.max(state.unlockedStep, progression.automate);
    if (savedEmail) state.unlockedStep = Math.max(state.unlockedStep, progression.gate);
    if (state.path) state.unlockedStep = Math.max(state.unlockedStep, progression.viewerBuilds);
    if (!hadActiveStep) {
      if (state.path) {
        state.activeStep = progression.path;
      } else if (savedEmail) {
        state.activeStep = progression.gate;
      } else {
        state.activeStep = Math.min(state.unlockedStep, progression.gate - 1);
      }
    }
    state.activeStep = Math.min(Math.max(1, state.activeStep), Math.max(1, state.unlockedStep));
    save(storageKey, state);
  }

  function migrateChoice(key, dataset) {
    const stableKey = `${key}Keys`;
    if (state[stableKey]) return;
    const labels = new Map();
    Object.values(dataset).forEach((items) => {
      items.forEach((item, index) => labels.set(item, `${key}:${index}`));
    });
    const raw = Array.isArray(state[key]) ? state[key] : state[key] ? [state[key]] : [];
    state[stableKey] = raw.map((item) => labels.get(item)).filter(Boolean);
  }

  function applyUnlockedSteps() {
    const active = Math.max(1, Number(state.activeStep) || 1);
    if (renderedActiveStep !== active) {
      renderedActiveStep = active;
      activeStepReadyAt = Date.now() + 1600;
    }
    document.querySelectorAll("[data-step]").forEach((section) => {
      const step = Number(section.dataset.step);
      section.hidden = step > active;
      section.classList.toggle("is-active", step === active);
      section.classList.toggle("is-complete", step < active);
      if (step === active) {
        section.setAttribute("aria-current", "step");
      } else {
        section.removeAttribute("aria-current");
      }
    });
  }

  function unlockStep(step, scroll = true) {
    const next = Math.max(Number(state.unlockedStep) || 1, step);
    state.unlockedStep = next;
    state.activeStep = Math.min(step, next);
    save(storageKey, state);
    applyUnlockedSteps();
    renderProgress();
    renderPassport();
    persistVisitorProgress();
    const target = document.querySelector(`[data-step="${step}"]`);
    if (target) {
      target.classList.add("is-unlocking");
      setTimeout(() => target.classList.remove("is-unlocking"), 800);
      if (scroll) setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "start" }), 180);
    }
  }

  function unlockGate(scroll = true) {
    const next = Math.max(Number(state.unlockedStep) || 1, progression.gate);
    state.unlockedStep = next;
    if (scroll || Number(state.activeStep) < progression.gate) {
      state.activeStep = progression.gate;
    }
    save(storageKey, state);
    applyUnlockedSteps();
    renderProgress();
    renderPassport();
    persistVisitorProgress();
    const target = document.querySelector('[data-step="10"]');
    if (target) {
      target.classList.add("is-unlocking");
      setTimeout(() => target.classList.remove("is-unlocking"), 800);
      if (scroll) setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "start" }), 900);
    }
  }

  function completePath() {
    markComplete("path");
    state.unlockedStep = Math.max(Number(state.unlockedStep) || 1, progression.viewerBuilds);
    state.activeStep = progression.path;
    save(storageKey, state);
    applyUnlockedSteps();
    renderProgress();
    renderPassport();
    persistVisitorProgress();
    showReward();
    const target = document.querySelector('[data-step="11"]');
    if (target) {
      target.classList.add("is-unlocking");
      setTimeout(() => target.classList.remove("is-unlocking"), 800);
      setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "start" }), 180);
    }
  }

  function bindAutoUnlocks() {
    const bindings = [
      ["3", "story", progression.story],
      ["4", "workflow", progression.workflow]
    ];
    const checkAutoUnlocks = () => {
      bindings.forEach(([step, key, unlockTo]) => {
        const section = document.querySelector(`[data-step="${step}"]`);
        if (!section || section.hidden) return;
        if (Number(state.activeStep) !== Number(step) || Date.now() < activeStepReadyAt) return;
        const rect = section.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.72 && rect.bottom > window.innerHeight * 0.18) {
          completeInteraction(key, unlockTo, false);
        }
      });
    };
    window.removeEventListener("scroll", window.__doneOvernightAutoUnlock);
    window.__doneOvernightAutoUnlock = checkAutoUnlocks;
    window.addEventListener("scroll", checkAutoUnlocks, { passive: true });
    window.addEventListener("resize", checkAutoUnlocks, { passive: true });
    setTimeout(checkAutoUnlocks, 250);
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const found = bindings.find(([step]) => entry.target.dataset.step === step);
        if (!found || Number(state.activeStep) !== Number(found[0]) || Date.now() < activeStepReadyAt) return;
        if (found) completeInteraction(found[1], found[2], false);
      });
    }, { threshold: 0.45 });
    bindings.forEach(([step]) => {
      const section = document.querySelector(`[data-step="${step}"]`);
      if (section) observer.observe(section);
    });
  }

  function completeInteraction(key, nextStep, scroll = true) {
    markComplete(key);
    unlockStep(nextStep, scroll);
    showReward();
  }

  function markComplete(key) {
    state.completed = Array.isArray(state.completed) ? state.completed : [];
    if (!state.completed.includes(key)) state.completed.push(key);
    save(storageKey, state);
    renderProgress();
    renderPassport();
    persistVisitorProgress();
  }

  function renderProgress() {
    const root = document.getElementById("experience-progress");
    if (!root) return;
    const completed = Math.min(progressTotal, (state.completed || []).length);
    root.innerHTML = Array.from({ length: progressTotal }, (_, index) => `<span class="${index < completed ? "is-filled" : ""}"></span>`).join("");
    root.setAttribute("aria-label", `${completed} / ${progressTotal}`);
  }

  function showReward(message) {
    const toast = document.getElementById("unlock-toast");
    if (!toast) return;
    toast.textContent = message || copy[lang].unlockToast;
    toast.classList.remove("is-visible");
    void toast.offsetWidth;
    toast.classList.add("is-visible");
    document.body.classList.add("has-reward");
    if ("vibrate" in navigator) {
      try { navigator.vibrate(12); } catch (error) {}
    }
    window.clearTimeout(window.__doneOvernightToastTimer);
    window.__doneOvernightToastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
      document.body.classList.remove("has-reward");
    }, 1100);
  }

  function renderReturnVisitor() {
    const note = document.getElementById("return-note");
    if (!note) return;
    const completed = (state.completed || []).length;
    if (!completed) return;
    const pct = Math.min(100, Math.round((completed / progressTotal) * 100));
    note.hidden = false;
    note.textContent = `${copy[lang].welcomeBack} ${pct}% ${copy[lang].continueJourney}`;
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
