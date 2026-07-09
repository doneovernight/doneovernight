(() => {
  const storageKey = "doneovernight.experience.v1";
  const emailKey = "doneovernight.experience.email.v1";
  const confirmationCooldownKey = "doneovernight.experience.confirmationCooldown.v1";
  const memoryKey = "doneovernight.memory.v1";
  const canonicalExperienceUrl = "https://doneovernight.com/how-it-works";
  const canonicalLiveUrl = "https://doneovernight.com/live";
  const state = read(storageKey, {});
  const savedEmail = read(emailKey, null);
  const progressKey = "doneovernight.visitorProgress.v1";
  let platformSignal = null;
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
      multiple: "Pick the signals you want to see built.",
      storyTitle: "We don't sell AI. We build operating systems.",
      storyCopy: "The useful part is not a model. It is the way work moves.",
      oldWorkflow: "Old workflow",
      newWorkflow: "Connected workflow",
      workflowTitle: "Workflow becomes visible.",
      unlockToast: "Unlocked",
      welcomeBack: "Welcome back.",
      continueJourney: "Continue your journey.",
      examples: "Choose your industry.",
      improveTitle: "What are you looking to improve?",
      improveCopy: "Choose the improvements that would create the most leverage.",
      otherIndustry: "Other...",
      otherIndustryQuestion: "What industry are you in?",
      otherIndustryPlaceholder: "Type your industry",
      operatorQuestion: "What makes an operator?",
      operatorCopy: "This shapes the Builder Profile around the kind of leverage you notice first.",
      reflectionOne: "Where are you today?",
      reflectionTwo: "What would you automate first?",
      otherPlaceholder: "Type your own answer",
      gateTitle: "Unlock your access.",
      gateCopy: "Save your Builder Profile and unlock the final layer.",
      gateNoSpam: "We'll send your access link and keep this journey attached to it.",
      email: "Email",
      name: "Name, optional",
      social: "TikTok / Instagram handle",
      socialPlaceholder: "@yourname",
      unlock: "Unlock",
      continue: "Continue",
      emailError: "Enter a valid email to continue.",
      emailSending: "Sending access...",
      emailSendFailed: "Confirmation email could not be sent. Try again.",
      emailPendingCopy: "Check your inbox. Your DONEOVERNIGHT access is being prepared.",
      emailFallback: "We could not send the access email yet. Try again in a minute or DM @doneovernight.",
      emailReviewTitle: "Is this email correct?",
      editEmail: "Edit",
      confirmEmail: "Confirm",
      emailConfirmedTitle: "Access unlocked",
      emailConfirmedHeadline: "You're in.",
      emailConfirmedCopy: "Check your inbox. Your DONEOVERNIGHT access has been sent.",
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
      pathTitle: "Builder Profile prepared.",
      pathCopy: "Your answers are now shaping the profile you'll unlock at the end.",
      recommendationsCopy: "These are the routes your answers point toward.",
      livePreview: "Live preview",
      livePreviewCopy: "A glimpse of what is being built now.",
      openLive: "Open Live Build",
      followTitle: "You unlocked DONEOVERNIGHT.",
      followCopy: "Now watch it being built.",
      followCardTitle: "You've reached the end.",
      followCardCopy: "The rest happens in public.",
      currentBuild: "Current Build",
      currentProject: "Current Project",
      progress: "Progress",
      latestDeployment: "Latest deployment",
      estimated: "Estimated completion",
      lastUpdate: "Last Update",
      currentFocus: "Current Focus",
      placeholder: "Waiting for connection",
      liveTitle: "Live build signal.",
      liveText: "A quiet window into what DONEOVERNIGHT is building, shipping, and learning. Live data connects here next.",
      foundingBuilder: "Founding Builder",
      builderNumber: "Builder #",
      builderPending: "Preparing",
      joined: "Joined",
      lastVisit: "Last visit",
      sinceLastVisit: "Since your last visit",
      deployment: "deployment",
      deployments: "deployments",
      journalUpdate: "journal update",
      journalUpdates: "journal updates",
      resourcesOpened: "Resources opened",
      liveVisits: "Live visits",
      recentActivity: "Recent Activity",
      wins: "Latest Wins",
      finished: "Recently Finished",
      upcoming: "Upcoming Builds",
      viewerTitle: "What should DONEOVERNIGHT build next?",
      viewerOptionalCopy: "Optional. Share a build idea or skip straight to your Builder Profile.",
      idea: "Idea",
      description: "Description",
      website: "Website, optional",
      submitIdea: "Submit idea",
      skipViewerBuild: "Skip for now",
      ideaSaved: "Your idea has been added.",
      ideaFailed: "We could not add your idea yet. Try again in a minute.",
      viewerSubmitted: "Viewer Build submitted",
      viewerBuildId: "Viewer Build ID",
      status: "Status",
      submitted: "Submitted",
      estimatedReview: "Estimated review",
      reviewWindow: "Within a few days",
      viewerSuccessCopy: "We'll notify you if your idea moves into review or development.",
      copyResult: "Copy your result",
      sharePage: "Share this page",
      copied: "Profile copied.",
      linkCopied: "Link copied",
      nextLive: "Next: Live Build",
      nextViewer: "Next: Viewer Builds",
      nextFollow: "Next: Follow the journey",
      dmIdea: "DM us your build idea",
      solvePlaceholder: "What would this solve for you?",
      journeyComplete: "Builder created.",
      platformWelcome: "Welcome Builder.",
      unlockedExperience: "Experience unlocked",
      unlockedLive: "Live Builds unlocked",
      unlockedViewer: "Viewer Builds unlocked",
      unlockedJournal: "Build Journal unlocked",
      unlockedResources: "Resources unlocked",
      earlyBuilder: "You're officially inside.",
      journeyId: "Journey ID",
      journeyStarted: "Journey started",
      completion: "Completion",
      chosenPath: "Builder Mode",
      chosenInterests: "Chosen Interests",
      builderProfile: "Builder Profile",
      automationChoice: "Automation Choice",
      currentStage: "Current Stage",
      recommendedResources: "Recommended Resources",
      recommendedBuilds: "Recommended Builds",
      journeyCompleteStatus: "Builder created",
      walletComingSoon: "Wallet delivery is prepared and will unlock when credentials are configured.",
      result: "Result",
      openPlatform: "Builder Home coming soon",
      builderHomeSoon: "Builder Home coming soon",
      platformHub: "Builder Home",
      platformHubTitle: "Your Builder OS.",
      platformHubCopy: "Choose the next module.",
      hubLibrary: "Library",
      hubLibraryCopy: "Library module and access.",
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
      multiple: "Kies de signalen die je gebouwd wilt zien.",
      storyTitle: "We verkopen geen AI. We bouwen besturingssystemen.",
      storyCopy: "Het waardevolle deel is niet een model. Het is hoe werk beweegt.",
      oldWorkflow: "Oude workflow",
      newWorkflow: "Verbonden workflow",
      workflowTitle: "Workflow wordt zichtbaar.",
      unlockToast: "Ontgrendeld",
      welcomeBack: "Welkom terug.",
      continueJourney: "Ga verder.",
      examples: "Kies je industrie.",
      improveTitle: "Wat wil je verbeteren?",
      improveCopy: "Kies de verbeteringen die de meeste hefboom geven.",
      otherIndustry: "Anders...",
      otherIndustryQuestion: "In welke industrie zit je?",
      otherIndustryPlaceholder: "Typ je industrie",
      operatorQuestion: "Wat maakt iemand een operator?",
      operatorCopy: "Dit vormt je Builder Profile rond het soort hefboom dat jij als eerste ziet.",
      reflectionOne: "Waar sta je vandaag?",
      reflectionTwo: "Wat zou je als eerste automatiseren?",
      otherPlaceholder: "Typ je eigen antwoord",
      gateTitle: "Ontgrendel je toegang.",
      gateCopy: "Sla je Builder Profile op en ontgrendel de laatste laag.",
      gateNoSpam: "We sturen je access link en koppelen deze journey eraan.",
      email: "E-mail",
      name: "Naam, optioneel",
      social: "TikTok / Instagram handle",
      socialPlaceholder: "@jouwnaam",
      unlock: "Ontgrendel",
      continue: "Ga verder",
      emailError: "Voer een geldig e-mailadres in om door te gaan.",
      emailSending: "Toegang wordt verzonden...",
      emailSendFailed: "De bevestiging kon niet worden verzonden. Probeer opnieuw.",
      emailPendingCopy: "Check je inbox. Je DONEOVERNIGHT toegang wordt voorbereid.",
      emailFallback: "We konden de toegangsmail nog niet verzenden. Probeer het zo opnieuw of DM @doneovernight.",
      emailReviewTitle: "Klopt dit e-mailadres?",
      editEmail: "Bewerken",
      confirmEmail: "Bevestigen",
      emailConfirmedTitle: "Toegang ontgrendeld",
      emailConfirmedHeadline: "Je bent binnen.",
      emailConfirmedCopy: "Check je inbox. Je DONEOVERNIGHT toegang is verzonden.",
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
      pathTitle: "Builder Profile voorbereid.",
      pathCopy: "Je antwoorden vormen nu het profiel dat je aan het einde ontgrendelt.",
      recommendationsCopy: "Dit zijn de routes waar je antwoorden naartoe wijzen.",
      livePreview: "Live preview",
      livePreviewCopy: "Een glimp van wat nu wordt gebouwd.",
      openLive: "Open Live Build",
      followTitle: "Je hebt DONEOVERNIGHT ontgrendeld.",
      followCopy: "Bekijk nu hoe het wordt gebouwd.",
      followCardTitle: "Je hebt het einde bereikt.",
      followCardCopy: "De rest gebeurt publiek.",
      currentBuild: "Huidige build",
      currentProject: "Huidig project",
      progress: "Voortgang",
      latestDeployment: "Laatste deployment",
      estimated: "Geschatte oplevering",
      lastUpdate: "Laatste update",
      currentFocus: "Huidige focus",
      placeholder: "Wacht op koppeling",
      liveTitle: "Live build signaal.",
      liveText: "Een rustig venster op wat DONEOVERNIGHT bouwt, shipped en leert. Live data wordt hierna gekoppeld.",
      foundingBuilder: "Founding Builder",
      builderNumber: "Builder #",
      builderPending: "Voorbereiden",
      joined: "Aangesloten",
      lastVisit: "Laatste bezoek",
      sinceLastVisit: "Sinds je laatste bezoek",
      deployment: "deployment",
      deployments: "deployments",
      journalUpdate: "journal update",
      journalUpdates: "journal updates",
      resourcesOpened: "Resources geopend",
      liveVisits: "Live bezoeken",
      recentActivity: "Recente activiteit",
      wins: "Laatste wins",
      finished: "Recent afgerond",
      upcoming: "Aankomende builds",
      viewerTitle: "Wat moet DONEOVERNIGHT hierna bouwen?",
      viewerOptionalCopy: "Optioneel. Deel een build idee of ga direct door naar je Builder Profile.",
      idea: "Idee",
      description: "Beschrijving",
      website: "Website, optioneel",
      submitIdea: "Verstuur idee",
      skipViewerBuild: "Sla nu over",
      ideaSaved: "Je idee is toegevoegd.",
      ideaFailed: "We konden je idee nog niet toevoegen. Probeer het zo opnieuw.",
      viewerSubmitted: "Viewer Build ingediend",
      viewerBuildId: "Viewer Build ID",
      status: "Status",
      submitted: "Ingediend",
      estimatedReview: "Geschatte review",
      reviewWindow: "Binnen een paar dagen",
      viewerSuccessCopy: "We laten het weten als je idee naar review of ontwikkeling gaat.",
      copyResult: "Kopieer je resultaat",
      sharePage: "Deel deze pagina",
      copied: "Profiel gekopieerd.",
      linkCopied: "Link gekopieerd",
      nextLive: "Volgende: Live Build",
      nextViewer: "Volgende: Viewer Builds",
      nextFollow: "Volgende: volg de reis",
      dmIdea: "DM ons je build idee",
      solvePlaceholder: "Wat zou dit voor je oplossen?",
      journeyComplete: "Builder aangemaakt.",
      platformWelcome: "Welkom Builder.",
      unlockedExperience: "Experience ontgrendeld",
      unlockedLive: "Live Builds ontgrendeld",
      unlockedViewer: "Viewer Builds ontgrendeld",
      unlockedJournal: "Build Journal ontgrendeld",
      unlockedResources: "Resources ontgrendeld",
      earlyBuilder: "Je zit er officieel in.",
      journeyId: "Journey ID",
      journeyStarted: "Reis gestart",
      completion: "Voltooiing",
      chosenPath: "Builder mode",
      chosenInterests: "Gekozen interesses",
      builderProfile: "Builder Profiel",
      automationChoice: "Automatisering",
      currentStage: "Fase",
      recommendedResources: "Aanbevolen resources",
      recommendedBuilds: "Aanbevolen builds",
      journeyCompleteStatus: "Builder aangemaakt",
      walletComingSoon: "Wallet ondersteuning komt eraan.",
      result: "Resultaat",
      openPlatform: "Builder Home binnenkort",
      builderHomeSoon: "Builder Home binnenkort",
      platformHub: "Builder Home",
      platformHubTitle: "Jouw Builder OS.",
      platformHubCopy: "Kies de volgende module.",
      hubLibrary: "Library",
      hubLibraryCopy: "Library module en toegang.",
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
    goals: {
      en: ["AI", "Automation", "Website", "Branding", "CRM", "Lead generation", "Internal tools", "Client portal", "Operator portal", "Dashboard", "Reporting", "Scheduling", "Bookings", "Inventory", "Document management", "Knowledge base", "Workflows", "Integrations", "Custom software", "Mobile app", "API", "Payments", "Operations", "Marketing", "Sales", "Customer support"],
      nl: ["AI", "Automatisering", "Website", "Branding", "CRM", "Leadgeneratie", "Interne tools", "Client portal", "Operator portal", "Dashboard", "Reporting", "Planning", "Boekingen", "Voorraad", "Documentbeheer", "Knowledge base", "Workflows", "Integraties", "Custom software", "Mobiele app", "API", "Betalingen", "Operations", "Marketing", "Sales", "Klantenservice"]
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
    },
    recommendationDescriptions: {
      en: {
        "AI": "Use intelligence where judgment, context, and speed actually improve the workflow.",
        "Architecture": "Map the operating system before adding more tools.",
        "Automation": "Remove the repeated handoffs that quietly drain time every week.",
        "Business": "Turn momentum into a system your team can repeat.",
        "Live": "Watch what is being shipped and how the execution layer develops.",
        "Operators": "Study the role that keeps systems moving after the first build.",
        "Systems": "Connect intake, decisions, follow-up, and delivery into one rhythm.",
        "Viewer Builds": "Shape what DONEOVERNIGHT should build next."
      },
      nl: {
        "AI": "Gebruik intelligentie waar oordeel, context en snelheid de workflow echt verbeteren.",
        "Architecture": "Teken het operating system voordat je meer tools toevoegt.",
        "Automation": "Haal de herhaalde overdrachten weg die elke week tijd lekken.",
        "Business": "Zet momentum om in een systeem dat je team kan herhalen.",
        "Live": "Bekijk wat er wordt shipped en hoe de executielaag groeit.",
        "Operators": "Bestudeer de rol die systemen laat bewegen na de eerste build.",
        "Systems": "Verbind intake, besluiten, opvolging en delivery in een ritme.",
        "Viewer Builds": "Geef richting aan wat DONEOVERNIGHT hierna bouwt."
      }
    }
  };

  const live = {
    build: "Waiting for today's deployment.",
    operator: "Waiting for the next operator session.",
    project: "DONEOVERNIGHT HQ",
    repository: "doneovernight.com",
    branch: "Main branch is standing by.",
    commit: "Waiting for the next commit.",
    heartbeat: "Waiting for heartbeat",
    repositoryStatus: "Waiting for GitHub connection.",
    deployment: "No deployment yet today.",
    completion: "Tonight",
    lastUpdate: "Waiting for today's build signal.",
    focus: "Living memory and platform signal",
    progress: 22,
    progressLabel: "Waiting for today's build signal."
  };

  const progression = {
    first: 1,
    discover: 2,
    interests: 3,
    story: 4,
    workflow: 5,
    example: 6,
    goals: 7,
    operatorTrait: 8,
    reflection: 9,
    automate: 10,
    gate: 11,
    recommendations: 12,
    viewerBuilds: 13
  };

  const progressionVersion = 6;
  const stepCompletionKeys = {
    1: "discover",
    2: "interests",
    3: "story",
    4: "workflow",
    5: "example",
    6: "goals",
    7: "operatorTrait",
    8: "reflection",
    9: "automate",
    10: "gate",
    11: "recommendations",
    12: "viewerBuilds"
  };

  const progressTotal = 12;
  let renderedActiveStep = null;
  let activeStepReadyAt = Date.now();
  let interactionLocked = false;
  let scrollFrame = 0;
  let scrollRun = 0;
  let platformProgressTimer = 0;
  const tapFeedbackMs = 320;
  const insightDwellMs = 1700;

  document.addEventListener("DOMContentLoaded", () => {
    applyLanguage();
    ensureJourney();
    initializeMemory();
    trackPageLifecycle();
    hydratePlatformSignal();
    mountHowItWorks();
    mountLive();
    mountPlatformPages();
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
    mountChoices("goals-grid", data.goals[lang], "goals", true);
    mountQuiz();
    mountChoices("reflection-grid", data.reflections[lang], "reflection", false);
    mountChoices("automate-grid", data.automate[lang], "automate", true);
    mountAutomationOther();
    mountGate();
    mountViewerBuilds();
    renderPersonalResult();
    bindResultActions();
    bindNextUnlocks();
    bindChoiceContinues();
    bindHeroScroll();
    bindPlatformHub();
    renderProgress();
    renderReturnVisitor();
    hydrateReturnVisitor();
    renderPassport();
    persistVisitorProgress();
    applyUnlockedSteps();
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
    bindPlatformHub();
    hydrateLiveData();
  }

  function mountPlatformPages() {
    if (document.body.dataset.platform === "resources" || document.body.dataset.platform === "library") mountResourceInterest();
    if (document.body.dataset.platform === "library") mountLibrary();
    if (document.body.dataset.platform === "journal") hydrateJournalData();
    if (document.body.dataset.platform === "hq") mountHq();
    if (document.body.dataset.platform === "hq-login") mountHqLogin();
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
        if (!canInteract(button)) return;
        const value = button.dataset.value;
        const choiceKey = button.dataset.choiceKey;
        if (multi) {
          const next = new Set(state[stableKey] || []);
          next.has(choiceKey) ? next.delete(choiceKey) : next.add(choiceKey);
          state[stableKey] = Array.from(next);
          state[key] = Array.from(next).map((item) => items[Number(item.split(":")[1])]).filter(Boolean);
          button.classList.toggle("is-selected");
          updateChoiceContinue(key);
        } else {
          state[stableKey] = [choiceKey];
          state[key] = value;
          root.querySelectorAll("button").forEach((item) => item.classList.remove("is-selected"));
          button.classList.add("is-selected");
          if (progression[key]) completeInteractionAfterFeedback(key, progression[key], button);
        }
        save(storageKey, state);
      });
    });
    updateChoiceContinue(key);
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
    const continueButton = document.querySelector("[data-industry-continue]");
    if (!tabs || !board) return;
    const industries = industryCatalog();
    const other = otherIndustryOption();
    const selected = state.example && (industries.some((item) => item.key === state.example) || state.example === other.key)
      ? state.example
      : "";
    const preview = selected || "";
    tabs.innerHTML = `
      <label class="industry-search">
        <span>${lang === "nl" ? "Zoek industrie" : "Search industry"}</span>
        <input id="industry-search" type="search" autocomplete="off" placeholder="${lang === "nl" ? `Zoek alle ${industries.length} industrieen` : `Search all ${industries.length} industries`}" aria-label="${lang === "nl" ? "Zoek industrie" : "Search industry"}">
      </label>
      <div class="industry-grid" data-industry-grid></div>
    `;
    const input = tabs.querySelector("#industry-search");
    const grid = tabs.querySelector("[data-industry-grid]");
    renderIndustryGrid("");
    renderExample(preview, !selected);
    updateIndustryContinue();
    if (input) {
      input.oninput = () => renderIndustryGrid(input.value);
    }
    if (continueButton) {
      continueButton.onclick = () => {
        if (!canInteract(continueButton) || !industrySelectionReady()) return;
        completeInteractionAfterFeedback("example", progression.example, continueButton);
      };
    }

    function renderIndustryGrid(query = "") {
      const filtered = searchIndustries(industries, query).concat(other);
      grid.innerHTML = filtered.map((industry) => `
        <button class="tab-pill industry-pill ${industry.key === state.example ? "is-active" : ""} ${industry.key === other.key ? "is-other" : ""}" type="button" data-example="${escapeAttr(industry.key)}" aria-pressed="${industry.key === state.example ? "true" : "false"}">
          <span>${escapeHtml(industryLabel(industry))}</span>
          <small>${escapeHtml((industry.signals || []).slice(0, 2).join(" / "))}</small>
        </button>
      `).join("");
      grid.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => {
          if (!canInteract(button)) return;
          state.example = button.dataset.example;
          if (state.example !== other.key) {
            const selectedIndustry = industryByKey(state.example);
            state.industry = industryProfile(selectedIndustry);
            state.customIndustry = "";
          } else {
            state.industry = industryProfile(other, state.customIndustry);
          }
          save(storageKey, state);
          grid.querySelectorAll("button").forEach((item) => {
            item.classList.remove("is-active");
            item.setAttribute("aria-pressed", "false");
          });
          button.classList.add("is-active");
          button.setAttribute("aria-pressed", "true");
          renderExample(button.dataset.example, false);
          updateIndustryContinue();
        });
      });
    }

    function updateIndustryContinue() {
      if (!continueButton) return;
      const ready = industrySelectionReady();
      continueButton.disabled = !ready;
      continueButton.setAttribute("aria-disabled", ready ? "false" : "true");
      continueButton.classList.toggle("is-ready", ready);
    }

    function renderExample(key, isPreview = false) {
      if (!key) {
        board.classList.add("is-neutral");
        board.classList.remove("is-other");
        board.innerHTML = `
          <span class="placeholder-badge">${industries.length} ${lang === "nl" ? "industrieen" : "industries"}</span>
          <h3>${lang === "nl" ? "Kies je wereld." : "Select your sector."}</h3>
          <p>${lang === "nl" ? "Zoek of kies een industrie om te zien waar DONEOVERNIGHT hefboom kan bouwen." : "Search or choose an industry to see where DONEOVERNIGHT can build leverage."}</p>
          <div class="industry-signal-row">
            <span>AI</span>
            <span>Automation</span>
            <span>Systems</span>
            <span>Operations</span>
          </div>
        `;
        return;
      }
      const industry = key === other.key ? other : industries.find((item) => item.key === key) || industries[0];
      if (!industry) return;
      const signals = (industry.signals || []).slice(0, 4);
      if (industry.key === other.key) {
        board.classList.add("is-other");
        board.innerHTML = `
          <span class="placeholder-badge">${industries.length} ${lang === "nl" ? "industrieen" : "industries"} + ${escapeHtml(industryLabel(other))}</span>
          <h3>${escapeHtml(industryLabel(other))}</h3>
          <label class="other-industry-field" for="other-industry-input">
            <span>${escapeHtml(copy[lang].otherIndustryQuestion)}</span>
            <input id="other-industry-input" class="text-field" type="text" autocomplete="organization-title" value="${escapeAttr(state.customIndustry || "")}" placeholder="${escapeAttr(copy[lang].otherIndustryPlaceholder)}">
          </label>
        `;
        const customInput = board.querySelector("#other-industry-input");
        if (customInput) {
          customInput.oninput = () => {
            state.customIndustry = customInput.value.trim();
            state.industry = industryProfile(other, state.customIndustry);
            save(storageKey, state);
            updateIndustryContinue();
          };
          customInput.focus({ preventScroll: true });
        }
      } else {
        board.classList.remove("is-neutral");
        board.classList.remove("is-other");
        board.innerHTML = `
        <span class="placeholder-badge">${isPreview ? (lang === "nl" ? "Kies een industrie" : "Select an industry") : `${industries.length} ${lang === "nl" ? "industrieen" : "industries"}`}</span>
        <h3>${escapeHtml(industryLabel(industry))}</h3>
        <p>${escapeHtml(industrySummary(industry))}</p>
        <div class="industry-signal-row">
          ${signals.map((signal) => `<span>${escapeHtml(signal)}</span>`).join("")}
        </div>
        `;
      }
      board.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 360, easing: "ease-out" });
    }
  }

  function industryCatalog() {
    const configured = Array.isArray(window.DONEOVERNIGHT_INDUSTRIES) ? window.DONEOVERNIGHT_INDUSTRIES : [];
    const fallback = Object.entries(data.examples).map(([key, value]) => ({
      key,
      label: { en: value.en[0], nl: value.nl[0] },
      summary: { en: value.en[1], nl: value.nl[1] },
      signals: []
    }));
    return (configured.length ? configured : fallback)
      .map((item) => {
        const key = String(item.key || "").trim();
        return { ...item, key, category: item.category || inferredIndustryCategory(key) };
      })
      .filter((item) => item.key);
  }

  function inferredIndustryCategory(key = "") {
    const groups = {
      Hospitality: ["restaurant", "cafe_bar", "hotel", "travel", "wellness_spa"],
      Retail: ["ecommerce", "retail", "fashion", "beauty", "wholesale"],
      Health: ["fitness", "healthcare", "dental", "mental_health", "pet_services"],
      Education: ["education", "coaching"],
      Creative: ["agency", "creative_studio", "marketing", "entertainment", "music", "creator_brand"],
      Professional: ["consulting", "legal", "accounting", "insurance", "finance", "hr_recruitment", "sales_team", "customer_support"],
      Property: ["real_estate", "construction", "architecture", "interior_design", "property_management", "cleaning_services", "home_services", "landscaping", "local_services"],
      Logistics: ["logistics", "transportation", "automotive"],
      Industrial: ["manufacturing", "agriculture", "food_beverage"],
      Public: ["nonprofit", "church", "government"],
      Technology: ["software", "saas", "app_startup", "ai_company", "cybersecurity", "data_analytics"]
    };
    const match = Object.entries(groups).find(([, keys]) => keys.includes(key));
    return match ? match[0] : "General";
  }

  function industryLabel(industry = {}) {
    const label = industry.label || {};
    return String(label[lang] || label.en || industry.name || industry.key || "").trim();
  }

  function industrySummary(industry = {}) {
    const summary = industry.summary || {};
    return String(summary[lang] || summary.en || "").trim();
  }

  function industryByKey(key) {
    return industryCatalog().find((industry) => industry.key === key);
  }

  function otherIndustryOption() {
    return {
      key: "other",
      category: "Custom",
      label: { en: copy.en.otherIndustry, nl: copy.nl.otherIndustry },
      summary: { en: copy.en.otherIndustryQuestion, nl: copy.nl.otherIndustryQuestion },
      signals: [lang === "nl" ? "Eigen industrie" : "Custom industry"],
      aliases: ["custom", "other", "anders"]
    };
  }

  function industryProfile(industry = {}, customLabel = "") {
    const label = String(customLabel || industryLabel(industry)).trim();
    return {
      key: industry.key || "",
      label,
      category: industry.category || "",
      custom: industry.key === "other",
      selected_at: new Date().toISOString()
    };
  }

  function selectedIndustryLabel() {
    if (state.example === "other") return String(state.customIndustry || state.industry?.label || "").trim();
    const selected = industryByKey(state.example);
    return selected ? industryLabel(selected) : String(state.industry?.label || "").trim();
  }

  function industrySelectionReady() {
    if (state.example === "other") return Boolean(String(state.customIndustry || state.industry?.label || "").trim());
    return Boolean(state.example && industryByKey(state.example));
  }

  function searchIndustries(industries = [], query = "") {
    const term = normalizeSearch(query);
    if (!term) return industries;
    return industries
      .map((industry, index) => ({ industry, index, score: industrySearchScore(industry, term) }))
      .filter((entry) => entry.score >= 18)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((entry) => entry.industry);
  }

  function industrySearchScore(industry = {}, term = "") {
    const aliases = Array.isArray(industry.aliases) ? industry.aliases : [];
    const signals = Array.isArray(industry.signals) ? industry.signals : [];
    const fields = [
      industry.key,
      industry.category,
      industryLabel(industry),
      industrySummary(industry),
      ...signals,
      ...aliases
    ].map(normalizeSearch).filter(Boolean);
    const text = fields.join(" ");
    if (!term) return 1;
    let score = 0;
    if (normalizeSearch(industryLabel(industry)) === term) score += 120;
    if (normalizeSearch(industryLabel(industry)).startsWith(term)) score += 90;
    if (fields.some((field) => field === term)) score += 80;
    if (fields.some((field) => field.startsWith(term))) score += 64;
    if (text.includes(term)) score += 44;
    const queryTokens = term.split(" ").filter(Boolean);
    const fieldTokens = text.split(" ").filter(Boolean);
    queryTokens.forEach((queryToken) => {
      fieldTokens.forEach((token) => {
        if (token === queryToken) score += 26;
        else if (token.startsWith(queryToken) || queryToken.startsWith(token)) score += 18;
        else if (isFuzzyMatch(queryToken, token)) score += 24;
      });
    });
    return score;
  }

  function normalizeSearch(value = "") {
    return String(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function isFuzzyMatch(queryToken = "", token = "") {
    if (queryToken.length < 4 || token.length < 4) return false;
    if (token.includes(queryToken) || queryToken.includes(token)) return true;
    const max = Math.max(queryToken.length, token.length);
    const allowed = max < 7 ? 1 : 2;
    return levenshtein(queryToken, token) <= allowed;
  }

  function levenshtein(a = "", b = "") {
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];
      for (let j = 1; j <= b.length; j += 1) {
        current[j] = a[i - 1] === b[j - 1]
          ? previous[j - 1]
          : Math.min(previous[j - 1], previous[j], current[j - 1]) + 1;
      }
      previous = current;
    }
    return previous[b.length];
  }

  function mountQuiz() {
    const root = document.getElementById("quiz-options");
    const result = document.getElementById("quiz-result");
    const continueButton = document.querySelector("[data-operator-continue]");
    if (!root || !result) return;
    const traits = Object.entries(data.quiz.traits);
    root.innerHTML = traits.map(([key, value]) => `<button class="quiz-option" type="button" data-trait="${key}">${value[lang]}</button>`).join("");
    root.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        if (!canInteract(button)) return;
        const trait = button.dataset.trait;
        state.operatorTrait = trait;
        save(storageKey, state);
        root.querySelectorAll("button").forEach((item) => item.classList.remove("is-selected"));
        button.classList.add("is-selected");
        result.classList.add("is-visible");
        result.innerHTML = `<h3>${data.quiz.results[trait][lang]}</h3><p class="step-copy">${copy[lang].operatorCopy}</p>`;
        result.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 380, easing: "ease-out" });
        updateOperatorContinue();
      });
    });
    if (continueButton) {
      continueButton.onclick = () => {
        if (!canInteract(continueButton) || !state.operatorTrait) return;
        completeInteractionAfterFeedback("operatorTrait", progression.operatorTrait, continueButton);
      };
    }
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
    updateOperatorContinue();
  }

  function updateOperatorContinue() {
    const button = document.querySelector("[data-operator-continue]");
    if (!button) return;
    const ready = Boolean(state.operatorTrait && data.quiz.results[state.operatorTrait]);
    button.disabled = !ready;
    button.setAttribute("aria-disabled", ready ? "false" : "true");
    button.classList.toggle("is-ready", ready);
  }

  function mountGate() {
    const list = document.getElementById("gate-list");
    const form = document.getElementById("email-form");
    const note = document.getElementById("email-note");
    const confirmation = document.getElementById("gate-confirmation");
    const confirmationCopy = document.getElementById("email-confirmation-copy");
    const review = document.getElementById("email-review");
    const reviewAddress = document.getElementById("email-review-address");
    const reviewEdit = document.getElementById("email-review-edit");
    const reviewConfirm = document.getElementById("email-review-confirm");
    const reviewNote = document.getElementById("email-review-note");
    const continueButton = document.getElementById("gate-continue");
    const resendButton = document.getElementById("resend-confirmation");
    const resendNote = document.getElementById("resend-note");
    const after = document.querySelectorAll("[data-after-gate]");
    if (list) list.innerHTML = data.gateItems[lang].map((item) => `<li>${item}</li>`).join("");
    if (savedEmail?.confirmation?.delivered === true) {
      showGateConfirmation(savedEmail.confirmation || { delivered: true }, false);
    }
    if (reviewEdit) {
      reviewEdit.onclick = () => {
        if (!canInteract(reviewEdit)) return;
        hideEmailReview();
        if (form) {
          form.hidden = false;
          form.email?.focus({ preventScroll: true });
        }
      };
    }
    if (reviewConfirm) {
      reviewConfirm.onclick = async () => {
        if (!canInteract(reviewConfirm)) return;
        await submitReviewedEmail();
      };
    }
    if (continueButton) {
      continueButton.onclick = () => {
        if (!canInteract(continueButton)) return;
        completeInteractionAfterFeedback("gate", progression.gate, continueButton);
      };
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
        if (result.delivered) {
          save(confirmationCooldownKey, { lastSentAt: Date.now() });
          showGateConfirmation(result, false);
        }
        if (resendNote) {
          resendNote.textContent = result.delivered ? copy[lang].sentAgain : copy[lang].emailFallback;
          resendNote.classList.toggle("is-success", result.delivered);
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
      if (!canInteract(form)) return;
      const email = form.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        note.textContent = copy[lang].emailError;
        note.classList.remove("is-success");
        return;
      }
      const socialHandle = form.social ? form.social.value.trim() : "";
      state.pendingEmailReview = {
        email,
        name: form.name.value.trim(),
        socialHandle
      };
      state.socialHandle = socialHandle;
      save(storageKey, state);
      showEmailReview(email);
    };

    async function submitReviewedEmail() {
      const pending = state.pendingEmailReview || {};
      const email = String(pending.email || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (reviewNote) {
          reviewNote.textContent = copy[lang].emailError;
          reviewNote.classList.remove("is-success");
        }
        return;
      }
      const submit = form.querySelector('[type="submit"]');
      if (submit) submit.disabled = true;
      if (reviewConfirm) reviewConfirm.disabled = true;
      if (reviewEdit) reviewEdit.disabled = true;
      if (reviewNote) {
        reviewNote.textContent = copy[lang].emailSending;
        reviewNote.classList.remove("is-success");
      }
      const socialHandle = String(pending.socialHandle || "").trim();
      state.socialHandle = socialHandle;
      save(storageKey, state);
      const confirmationPayload = buildJourneyConfirmationPayload({
        email,
        name: String(pending.name || "").trim(),
        socialHandle
      });
      const confirmationResult = await requestJourneyConfirmation(confirmationPayload);
      if (!confirmationResult.delivered) {
        if (reviewNote) {
          reviewNote.textContent = copy[lang].emailFallback;
          reviewNote.classList.remove("is-success");
        }
        if (submit) submit.disabled = false;
        if (reviewConfirm) reviewConfirm.disabled = false;
        if (reviewEdit) reviewEdit.disabled = false;
        return;
      }
      const payload = {
        email,
        name: String(pending.name || "").trim(),
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
          industry: state.industry || null,
          industryLabel: selectedIndustryLabel(),
          goals: state.goals || [],
          socialHandle
        }
      };
      save(emailKey, payload);
      save(confirmationCooldownKey, { lastSentAt: Date.now() });
      delete state.pendingEmailReview;
      save(storageKey, state);
      if (reviewNote) {
        reviewNote.textContent = copy[lang].welcome;
        reviewNote.classList.add("is-success");
      }
      persistVisitorProgress();
      showReward();
      showGateConfirmation(confirmationResult);
      if (submit) submit.disabled = false;
      if (reviewConfirm) reviewConfirm.disabled = false;
      if (reviewEdit) reviewEdit.disabled = false;
    }

    function showEmailReview(email) {
      if (!review || !form) return;
      const section = review.closest(".experience-step");
      const panel = review.closest(".gate-panel");
      if (section) section.classList.add("has-email-review");
      if (panel) panel.classList.add("is-reviewing");
      if (reviewAddress) reviewAddress.textContent = email;
      form.hidden = true;
      review.hidden = false;
      if (note) note.textContent = "";
      if (reviewNote) {
        reviewNote.textContent = "";
        reviewNote.classList.remove("is-success");
      }
      setTimeout(() => scrollToQuestion(review), 120);
    }

    function hideEmailReview() {
      if (!review) return;
      const section = review.closest(".experience-step");
      const panel = review.closest(".gate-panel");
      if (section) section.classList.remove("has-email-review");
      if (panel) panel.classList.remove("is-reviewing");
      review.hidden = true;
      if (reviewNote) {
        reviewNote.textContent = "";
        reviewNote.classList.remove("is-success");
      }
    }

    function showGateConfirmation(result = {}, scroll = true) {
      if (!confirmation || !form) return;
      const section = confirmation.closest(".experience-step");
      const panel = confirmation.closest(".gate-panel");
      if (section) section.classList.add("has-gate-confirmation");
      if (section) section.classList.remove("has-email-review");
      if (panel) panel.classList.add("is-confirmed");
      if (panel) panel.classList.remove("is-reviewing");
      form.hidden = true;
      if (review) review.hidden = true;
      confirmation.hidden = false;
      if (confirmationCopy) {
        confirmationCopy.textContent = result.delivered ? copy[lang].emailConfirmedCopy : copy[lang].emailPendingCopy;
      }
      if (scroll) setTimeout(() => scrollToQuestion(confirmation), 160);
      updateResendCooldown(resendButton, resendNote);
    }
  }

  function buildJourneyConfirmationPayload(input = {}) {
    ensureJourney();
    const language = platformLanguagePayload();
    return {
      email: input.email || "",
      name: input.name || "",
      social_handle: input.socialHandle || state.socialHandle || "",
      journey_id: state.journeyId || "",
      chosen_path: state.path || "",
      chosen_interests: state.interests || [],
      industry: state.industry || null,
      goals: state.goals || [],
      result: resolveCurrentResult(),
      source: state.discover || "how_it_works",
      created_at: new Date().toISOString(),
      ...language,
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

  function platformPayload(extra = {}) {
    const emailPayload = read(emailKey, {});
    const started = state.journeyStartedAt ? new Date(state.journeyStartedAt).getTime() : Date.now();
    const language = platformLanguagePayload(extra);
    return {
      journey_id: state.journeyId || "",
      builder_number: permanentBuilderNumber(),
      ...language,
      journey: {
        journey_id: state.journeyId || "",
        builder_number: permanentBuilderNumber(),
        email: emailPayload.email || "",
        social_handle: state.socialHandle || emailPayload.socialHandle || "",
        source: state.discover || "unknown",
        utm: state.utm || {},
        ...language,
        chosen_path: state.path || "",
        chosen_interests: state.interests || [],
        industry: state.industry || null,
        industry_label: selectedIndustryLabel(),
        goals: state.goals || [],
        completion: completionPercent(),
        result: document.getElementById("final-title")?.textContent || document.getElementById("personal-title")?.textContent || "",
        automate: Array.isArray(state.automate) ? state.automate : [],
        automation_choice: state.automationOther || "",
        journey_started_at: state.journeyStartedAt || "",
        returned: Boolean(state.returned),
        profile_copied: Boolean(state.profileCopied),
        share_clicked: Boolean(state.shareClicked),
        follow_clicked: Boolean(state.followClicked),
        time_spent: Math.max(0, Math.round((Date.now() - started) / 1000)),
        last_page: pageName()
      },
      progress: {
        builder_number: permanentBuilderNumber(),
        ...language,
        active_step: Number(state.activeStep) || 1,
        unlocked_step: Number(state.unlockedStep) || 1,
        completed: state.completed || [],
        completion: completionPercent()
      },
      ...extra
    };
  }

  async function postPlatformEvent(extra = {}) {
    try {
      const response = await fetch("/api/platform-events", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(platformPayload(extra)),
        keepalive: true
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async function requestViewerBuildSubmission(build = {}) {
    try {
      const response = await fetch("/api/platform-events", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(platformPayload({
          event: "viewer_build_submitted",
          viewer_build: build,
          idea: build.idea,
          title: build.idea,
          description: build.description,
          problem: build.solve,
          website: build.website,
          email: build.email,
          ...platformLanguagePayload(build),
          lang,
          page: pageName(),
          source: pageName()
        }))
      });
      const result = await response.json().catch(() => ({}));
      return {
        ...result,
        ok: response.ok && result.ok === true,
        statusCode: response.status
      };
    } catch (error) {
      return { ok: false, saved: false, error: "network_error" };
    }
  }

  function pageName() {
    const path = window.location.pathname.replace(/^\/|\/$/g, "") || "home";
    if (path === "how-it-works") return "how-it-works";
    if (path === "live") return "live";
    if (path === "resources") return "resources";
    if (path === "journal") return "journal";
    return path;
  }

  function platformLanguagePayload(extra = {}) {
    const browserLanguage = state.browserLanguage || navigator.language || "";
    const selected = state.selectedLanguage || lang;
    return {
      selected_language: selected,
      browser_language: browserLanguage,
      detected_content_language: detectSubmittedLanguage(extra),
      email_language: selected,
      lang: selected,
      language: selected
    };
  }

  function detectSubmittedLanguage(input = {}) {
    const text = [
      input.idea,
      input.title,
      input.description,
      input.problem,
      input.solve,
      input.viewer_problem,
      input.automationOther,
      state.automationOther
    ].filter(Boolean).join(" ").toLowerCase();
    if (!text) return "";
    const dutchWords = /\b(ik|wij|jij|je|mijn|onze|voor|met|het|een|de|graag|nodig|bouwen|maken|zodat|automatisering|klanten|aanvraag|formulier|bedrijf|beschrijving|probleem)\b/i;
    const englishWords = /\b(i|we|you|my|our|for|with|the|please|need|build|make|automation|customers|request|form|business|description|problem)\b/i;
    if (dutchWords.test(text)) return "nl";
    if (englishWords.test(text)) return "en";
    return "";
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

  function mountViewerBuilds() {
    const form = document.getElementById("viewer-form");
    const note = document.getElementById("viewer-note");
    const skip = document.getElementById("skip-viewer-build");
    if (skip) {
      skip.onclick = () => {
        if (!canInteract(skip)) return;
        completeInteractionAfterFeedback("viewerBuilds", progression.viewerBuilds, skip);
      };
    }
    if (!form) return;
    const fields = form.elements;
    fields.idea.placeholder = copy[lang].idea;
    fields.description.placeholder = copy[lang].description;
    if (fields.solve) fields.solve.placeholder = copy[lang].solvePlaceholder;
    fields.website.placeholder = copy[lang].website;
    fields.email.placeholder = copy[lang].email;
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (!canInteract(form)) return;
      if (form.dataset.submitting === "true") return;
      postPlatformEvent({ event: "viewer_build_started", page: pageName(), source: pageName() });
      const submit = form.querySelector('[type="submit"]');
      if (!fields.idea.value.trim() || !fields.description.value.trim() || !String(fields.solve?.value || "").trim()) {
        if (note) {
          note.textContent = copy[lang].ideaFailed;
          note.classList.remove("is-success");
        }
        return;
      }
      const email = fields.email.value.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (note) {
          note.textContent = copy[lang].emailError;
          note.classList.remove("is-success");
        }
        return;
      }
      const build = {
        idea: fields.idea.value.trim(),
        description: fields.description.value.trim(),
        solve: fields.solve ? fields.solve.value.trim() : "",
        website: fields.website.value.trim(),
        email,
        createdAt: new Date().toISOString()
      };
      if (submit) submit.disabled = true;
      form.dataset.submitting = "true";
      if (note) {
        note.textContent = "";
        note.classList.remove("is-success");
      }
      const result = await requestViewerBuildSubmission(build);
      if (!result.ok || !result.saved) {
        const drafts = read("doneovernight.viewerBuildDrafts.v1", []);
        drafts.push({ ...build, failedAt: new Date().toISOString(), reason: result.reason || result.error || "submission_failed" });
        save("doneovernight.viewerBuildDrafts.v1", drafts);
        if (note) {
          note.textContent = copy[lang].ideaFailed;
          note.classList.remove("is-success");
        }
        if (submit) submit.disabled = false;
        form.dataset.submitting = "";
        return;
      }
      build.viewerBuildId = result.viewer_build_id || "";
      build.status = result.status || "submitted";
      build.journeyId = result.journey_id || state.journeyId || "";
      const builds = read("doneovernight.viewerBuilds.v1", []);
      builds.push(build);
      save("doneovernight.viewerBuilds.v1", builds);
      form.reset();
      renderViewerBuildSuccess(form, note, result);
      updateMemory({
        viewerBuilds: read("doneovernight.viewerBuilds.v1", []),
        lastViewerBuildSubmittedAt: new Date().toISOString()
      });
      persistVisitorProgress();
      if (submit) submit.disabled = false;
      form.dataset.submitting = "";
    };
  }

  function renderViewerBuildSuccess(form, note, result = {}) {
    if (!note) return;
    if (form && form.contains(note)) {
      form.insertAdjacentElement("afterend", note);
    }
    if (form) form.hidden = true;
    note.classList.add("is-success");
    note.innerHTML = `
      <div class="viewer-success">
        <div class="viewer-success-title">✓ ${escapeHtml(copy[lang].viewerSubmitted)}</div>
        <dl>
          <div><dt>${escapeHtml(copy[lang].viewerBuildId)}</dt><dd>${escapeHtml(result.viewer_build_id || "")}</dd></div>
          <div><dt>${escapeHtml(copy[lang].journeyId)}</dt><dd>${escapeHtml(result.journey_id || state.journeyId || "")}</dd></div>
          <div><dt>${escapeHtml(copy[lang].status)}</dt><dd>${escapeHtml(copy[lang].submitted)}</dd></div>
          <div><dt>${escapeHtml(copy[lang].estimatedReview)}</dt><dd>${escapeHtml(copy[lang].reviewWindow)}</dd></div>
        </dl>
        <p>${escapeHtml(copy[lang].viewerSuccessCopy)}</p>
        <div class="viewer-success-actions">
          ${document.body.dataset.experience ? `<button class="quiet-action" type="button" data-viewer-continue>${escapeHtml(copy[lang].continue)}</button>` : ""}
        </div>
      </div>
    `;
    const continueButton = note.querySelector("[data-viewer-continue]");
    if (continueButton) {
      continueButton.onclick = () => {
        if (!canInteract(form)) return;
        completeInteractionAfterFeedback("viewerBuilds", progression.viewerBuilds, continueButton);
      };
    }
    showReward(copy[lang].ideaSaved);
  }

  function mountAutomationOther() {
    const input = document.getElementById("automation-other");
    if (!input) return;
    input.value = state.automationOther || "";
    input.oninput = () => {
      state.automationOther = input.value.trim();
      save(storageKey, state);
      updateChoiceContinue("automate");
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
        if (!canInteract(button)) return;
        state.path = button.dataset.path;
        save(storageKey, state);
        root.querySelectorAll("button").forEach((item) => item.classList.remove("is-selected"));
        button.classList.add("is-selected");
        renderPersonalResult();
        completeInteractionAfterFeedback("path", progression.path, button);
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
    grid.innerHTML = labels.map((label) => {
      const text = data.recommendationDescriptions[lang][label] || data.recommendationDescriptions.en[label] || copy[lang].recommendationsCopy;
      return `<article class="recommendation-card"><span>${data.recommendationLabels[lang][label] || label}</span><small>${escapeHtml(text)}</small></article>`;
    }).join("");
  }

  function ensureJourney() {
    if (!state.journeyId) state.journeyId = `DON-${String(Math.floor(1 + Math.random() * 999999)).padStart(6, "0")}`;
    if (!state.journeyStartedAt) state.journeyStartedAt = new Date().toISOString();
    if (!state.browserLanguage) state.browserLanguage = navigator.language || "";
    if (!state.selectedLanguage) state.selectedLanguage = lang;
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

  function initializeMemory() {
    const now = new Date().toISOString();
    const memory = read(memoryKey, {});
    const visits = Number(memory.totalVisits || 0) + 1;
    const previousVisit = memory.lastVisit || "";
    const builderNumber = permanentBuilderNumber(memory);
    const next = {
      ...memory,
      journeyId: state.journeyId || "",
      completion: completionPercent(),
      chosenPath: state.path || memory.chosenPath || "",
      chosenInterests: state.interests || memory.chosenInterests || [],
      industry: state.industry || memory.industry || null,
      goals: state.goals || memory.goals || [],
      automationChoice: [...(Array.isArray(state.automate) ? state.automate : []), state.automationOther].filter(Boolean),
      viewerBuilds: read("doneovernight.viewerBuilds.v1", memory.viewerBuilds || []),
      resourcesOpened: memory.resourcesOpened || [],
      journalEntriesViewed: memory.journalEntriesViewed || [],
      livePageVisits: Number(memory.livePageVisits || 0) + (pageName() === "live" ? 1 : 0),
      emailsSent: memory.emailsSent || Boolean(currentSavedEmail()?.confirmation?.delivered),
      emailOpened: memory.emailOpened || false,
      profileCopied: memory.profileCopied || Boolean(state.profileCopied),
      shareClicked: memory.shareClicked || Boolean(state.shareClicked),
      tiktokClicked: memory.tiktokClicked || Boolean(state.followClicked),
      previousVisit,
      lastVisit: now,
      totalVisits: visits,
      timeSpent: Number(memory.timeSpent || 0),
      device: deviceType(),
      language: lang,
      source: state.discover || memory.source || "",
      foundingBuilder: completionPercent() >= 100 || memory.foundingBuilder === true,
      builderRank: memory.builderRank || "Explorer",
      builderNumber,
      joinedAt: memory.joinedAt || now
    };
    if (next.foundingBuilder) next.builderRank = "Builder";
    save(memoryKey, next);
  }

  function updateMemory(patch = {}) {
    const memory = read(memoryKey, {});
    save(memoryKey, { ...memory, ...patch, journeyId: state.journeyId || memory.journeyId || "" });
  }

  function hashString(value = "") {
    return Array.from(String(value)).reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
  }

  function deviceType() {
    const width = window.innerWidth || 0;
    if (width < 720) return "mobile";
    if (width < 1100) return "tablet";
    return "desktop";
  }

  async function hydratePlatformSignal() {
    try {
      const response = await fetch("/data/platform-signal.json", { cache: "no-store" });
      platformSignal = response.ok ? await response.json() : null;
    } catch (error) {
      platformSignal = null;
    }
    applyLiveSignalFallbacks();
  }

  function applyLiveSignalFallbacks() {
    if (!document.body.dataset.live) return;
    const waiting = platformSignal?.live_waiting || {};
    fill("[data-live='deployment']", waiting.deployment || live.deployment);
    fill("[data-live='operator']", waiting.operator || live.operator);
    fill("[data-live='repositoryStatus']", waiting.github || live.repositoryStatus);
    fill("[data-live='heartbeat']", waiting.heartbeat || live.heartbeat);
    fill("[data-live='branch']", waiting.branch || live.branch);
    fill("[data-live='commit']", waiting.commit || live.commit);
    fill("[data-live='progressLabel']", waiting.progress || live.progressLabel);
    fill("[data-live='repository']", waiting.repository || live.repository);
    mountList("today-list", [waiting.activity || live.lastUpdate]);
    mountList("wins-list", [waiting.wins || "Wins will appear as they ship."]);
    mountList("finished-list", [waiting.finished || "Completed builds will collect here."]);
    mountList("upcoming-list", [waiting.upcoming || "Next builds are being shaped."]);
  }

  function renderPassport() {
    const memory = read(memoryKey, {});
    const builderNo = builderNumberValue();
    const type = builderType();
    const line = builderIdentityLine();
    const joined = formatDate(memory.joinedAt || state.journeyStartedAt || new Date().toISOString());
    fill("#builder-profile-type", type);
    fill("#journey-id", state.journeyId || "");
    fill("#builder-number", `#${builderNo}`);
    fill("#builder-status", copy[lang].journeyCompleteStatus || "Builder created");
    fill("#builder-joined", joined);
    fill("#journey-completion", `${completionPercent()}%`);
    fill("#journey-path", type);
    fill("#journey-interests", (state.interests || []).join(", ") || "Systems");
    fill("#builder-automation", automationLines().map((item) => item.replace(/^✓\s*/, "")).join(", ") || "Not selected");
    fill("#builder-identity-line", line);
    fill("#completion-welcome", builderNo ? `Welcome Builder #${builderNo}.` : copy[lang].platformWelcome);
    fill("#builder-stage", currentStage());
    fill("#builder-resources", recommendedResources().join(", "));
    fill("#builder-builds", recommendedBuilds().join(", "));
    fill("#builder-card-number", `Builder #${builderNo}`);
    fill("#builder-card-rank", memory.foundingBuilder ? copy[lang].foundingBuilder : "Builder");
    fill("#builder-card-joined", joined);
    fill("#builder-card-type", type);
    fill("#builder-card-journey", state.journeyId || "");
    fill("#builder-card-line", line);
    bindWalletActions();
    prepareBuilderIdentity();
  }

  function bindPlatformHub() {
    const button = document.getElementById("open-platform");
    const panel = document.getElementById("completion-panel");
    const hub = document.getElementById("platform-hub");
    if (button && panel && hub) {
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
      button.textContent = copy[lang].builderHomeSoon || copy[lang].openPlatform;
      button.onclick = () => {
        showReward(copy[lang].builderHomeSoon || copy[lang].openPlatform);
      };
      if (state.platformOpened) {
        state.platformOpened = false;
        save(storageKey, state);
      }
    }
    const follow = document.getElementById("follow-journey");
    if (follow) {
      follow.onclick = async () => {
        if (follow.classList.contains("is-following")) return;
        follow.classList.add("is-following");
        state.followClicked = true;
        save(storageKey, state);
        updateMemory({ tiktokClicked: true, followClickedAt: new Date().toISOString() });
        persistVisitorProgress();
        if ("vibrate" in navigator) {
          try { navigator.vibrate(18); } catch (error) {}
        }
        await postPlatformEvent({
          event: "follow_clicked",
          page: pageName(),
          source_page: pageName(),
          target_url: "https://www.tiktok.com/@doneovernight"
        });
        window.setTimeout(() => {
          window.location.href = "https://www.tiktok.com/@doneovernight";
        }, 500);
      };
    }
  }

  function completionPercent() {
    return Math.min(100, Math.round(((state.completed || []).length / progressTotal) * 100));
  }

  function scrollToPanel(element) {
    const offset = window.matchMedia("(max-width: 620px)").matches ? 168 : 96;
    const top = element.getBoundingClientRect().top + window.scrollY - offset;
    animateScrollTo(Math.max(0, top), 620);
  }

  function scrollToQuestion(section) {
    if (!section) return;
    const finalPanel = section.matches?.(".follow-screen") ? section.querySelector("#completion-panel") : null;
    const target = finalPanel || section.querySelector?.(".step-head:not([hidden])") || section.querySelector?.(".step-title") || section;
    const mobile = window.matchMedia("(max-width: 620px)").matches;
    const progressBottom = document.querySelector(".experience-progress")?.getBoundingClientRect().bottom || 0;
    const desiredTop = mobile ? Math.max(132, progressBottom + 42) : 104;
    const top = target.getBoundingClientRect().top + window.scrollY - desiredTop;
    const duration = mobile ? 760 : 640;
    animateScrollTo(Math.max(0, top), duration);
    window.setTimeout(() => settleQuestionPosition(target, desiredTop), duration + 40);
  }

  function scheduleStepScroll(target, delay = 180) {
    window.setTimeout(() => scrollToQuestion(target), delay);
    if (window.matchMedia("(max-width: 620px)").matches) {
      window.setTimeout(() => scrollToQuestion(target), delay + 980);
    }
  }

  function settleQuestionPosition(target, desiredTop) {
    const currentTop = target.getBoundingClientRect().top;
    if (Math.abs(currentTop - desiredTop) < 8) return;
    const top = window.scrollY + currentTop - desiredTop;
    scrollRun += 1;
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    window.scrollTo(0, Math.max(0, top));
  }

  function animateScrollTo(top, duration = 680) {
    scrollRun += 1;
    const run = scrollRun;
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.scrollTo(0, top);
      return;
    }
    const start = window.scrollY;
    const distance = top - start;
    if (Math.abs(distance) < 2) return;
    const startTime = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (now) => {
      if (run !== scrollRun) return;
      const progress = Math.min(1, (now - startTime) / duration);
      window.scrollTo(0, start + distance * ease(progress));
      if (progress < 1) scrollFrame = requestAnimationFrame(tick);
    };
    scrollFrame = requestAnimationFrame(tick);
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
        industry: state.industry || null,
        industry_label: selectedIndustryLabel(),
        goals: state.goals || [],
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
    schedulePlatformProgress();
  }

  function schedulePlatformProgress() {
    window.clearTimeout(platformProgressTimer);
    platformProgressTimer = window.setTimeout(() => {
      postPlatformEvent({ event: "journey_progress", page: pageName() });
    }, 1200);
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
      updateChoiceContinue(button.dataset.continueChoice);
      button.onclick = () => {
        if (!canInteract(button)) return;
        const key = button.dataset.continueChoice;
        const selected = state[`${key}Keys`] || [];
        if (key === "automate" && state.automationOther) {
          completeInteractionAfterFeedback(key, progression[key], button);
          return;
        }
        if (selected.length && progression[key]) completeInteractionAfterFeedback(key, progression[key], button);
      };
    });
  }

  function updateChoiceContinue(key) {
    const button = document.querySelector(`[data-continue-choice="${key}"]`);
    if (!button) return;
    const selected = Array.isArray(state[`${key}Keys`]) ? state[`${key}Keys`] : [];
    const ready = Boolean(selected.length || (key === "automate" && String(state.automationOther || "").trim()));
    button.disabled = !ready;
    button.setAttribute("aria-disabled", ready ? "false" : "true");
    button.classList.toggle("is-ready", ready);
  }

  function bindHeroScroll() {
    const link = document.querySelector(".scroll-cue");
    const target = document.getElementById("discover");
    if (!link || !target) return;
    link.onclick = (event) => {
      event.preventDefault();
      scheduleStepScroll(target, 0);
    };
  }

  function bindResultActions() {
    const copyButton = document.getElementById("copy-result");
    const shareButton = document.getElementById("share-page");
    if (copyButton) {
      copyButton.onclick = () => {
        const text = buildDoneOvernightProfile();
        copyText(text);
        state.profileCopied = true;
        save(storageKey, state);
        updateMemory({ profileCopied: true, profileCopiedAt: new Date().toISOString() });
        postPlatformEvent({ event: "profile_copied", page: pageName(), method: "clipboard", url: canonicalExperienceUrl });
        showReward(copy[lang].copied);
      };
    }
    if (shareButton) {
      shareButton.onclick = async () => {
        const sharePayload = {
          title: "Experience DONEOVERNIGHT",
          text: "I just completed the DONEOVERNIGHT experience.\n\nCurious what kind of builder you are?",
          url: canonicalExperienceUrl
        };
        if (navigator.share) {
          try {
            await navigator.share(sharePayload);
            state.shareClicked = true;
            save(storageKey, state);
            updateMemory({ shareClicked: true, shareClickedAt: new Date().toISOString() });
            postPlatformEvent({ event: "native_share", page: pageName(), method: "native", url: canonicalExperienceUrl });
            return;
          } catch (error) {}
        }
        copyText(canonicalExperienceUrl);
        state.shareClicked = true;
        save(storageKey, state);
        updateMemory({ shareClicked: true, shareClickedAt: new Date().toISOString() });
        postPlatformEvent({ event: "copy_link_fallback", page: pageName(), method: "copy_link", url: canonicalExperienceUrl });
        showReward(copy[lang].linkCopied);
      };
    }
  }

  function bindNextUnlocks() {
    document.querySelectorAll("[data-next-step]").forEach((button) => {
      button.onclick = () => {
        if (!canInteract(button)) return;
        completeInteractionAfterFeedback(button.dataset.nextKey, Number(button.dataset.nextStep), button);
      };
    });
  }

  function resultText() {
    const title = document.getElementById("personal-title")?.textContent || "";
    const body = document.getElementById("personal-copy")?.textContent || "";
    return `${title}\n${body}`.trim();
  }

  function buildDoneOvernightProfile() {
    ensureJourney();
    const lines = ["DONEOVERNIGHT PROFILE"];
    addProfileSection(lines, "Journey ID", [state.journeyId]);
    addProfileSection(lines, "Builder Number", [`#${builderNumberValue()}`]);
    addProfileSection(lines, "Discovered from", [state.discover]);
    addProfileSection(lines, "Builder Type", [builderType()]);
    addProfileSection(lines, "Identity Line", [builderIdentityLine()]);
    addProfileSection(lines, "Primary Interests", bulletLines(state.interests || []));
    addProfileSection(lines, "Industry", [selectedIndustryLabel()]);
    addProfileSection(lines, "Improvement Goals", bulletLines(state.goals || []));
    addProfileSection(lines, "Path", [pathLabel(state.path)]);
    addProfileSection(lines, "Current Stage", [currentStage()]);
    addProfileSection(lines, "You said you'd automate", automationLines());
    addProfileSection(lines, "Joined", [formatDate(read(memoryKey, {}).joinedAt || state.journeyStartedAt)]);
    addProfileSection(lines, "Completion", [`${completionPercent()}%`]);
    addProfileSection(lines, "Your mindset", mindsetLines());
    addProfileSection(lines, "Recommended Resources", bulletLines(recommendedResources()));
    addProfileSection(lines, "Recommended Builds", bulletLines(recommendedBuilds()));
    lines.push("", "Continue your journey:", canonicalLiveUrl);
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function addProfileSection(lines, title, values = []) {
    const safeValues = values.map((value) => String(value || "").trim()).filter(Boolean);
    if (!safeValues.length) return;
    lines.push("", title, ...safeValues);
  }

  function bulletLines(values = []) {
    return values.map((value) => String(value || "").trim()).filter(Boolean).map((value) => `✓ ${value}`);
  }

  function automationLines() {
    const answers = Array.isArray(state.automate) ? state.automate.slice() : state.automate ? [state.automate] : [];
    if (state.automationOther) answers.push(state.automationOther);
    return answers.map((value) => normalizeProfileLabel(value));
  }

  function mindsetLines() {
    const lines = [];
    const result = resolveCurrentResult();
    if (result) lines.push(result);
    const support = document.getElementById("personal-copy")?.textContent || data.summarySupport[lang][(summarySeed() + 3) % data.summarySupport[lang].length];
    if (support) lines.push(support);
    const source = [
      state.path,
      selectedIndustryLabel(),
      ...(state.interests || []),
      ...(Array.isArray(state.goals) ? state.goals : []),
      state.operatorTrait,
      state.reflection,
      ...(Array.isArray(state.automate) ? state.automate : state.automate ? [state.automate] : [])
    ].join("|").toLowerCase();
    const extras = [
      source.includes("automation") || source.includes("crm") || source.includes("lead")
        ? "You look for leverage instead of repetitive work."
        : "",
      source.includes("business") || source.includes("growing") || source.includes("planning")
        ? "You seem more interested in building long-term infrastructure than quick wins."
        : "",
      source.includes("ai") || source.includes("research")
        ? "You care about where intelligence connects to real execution."
        : "",
      source.includes("operator") || source.includes("ownership")
        ? "You notice the work between the idea and the outcome."
        : "",
      source.includes("design") || source.includes("taste")
        ? "You care about the quality of the system, not only whether it works."
        : ""
    ].filter(Boolean);
    const selected = extras[(summarySeed() + lines.length) % Math.max(1, extras.length)];
    if (selected) lines.push(selected);
    return Array.from(new Set(lines)).slice(0, 4);
  }

  function builderType() {
    const interests = new Set(state.interests || []);
    const hasInterest = (...labels) => labels.some((label) => interests.has(label));
    const path = state.path || "";
    if (path === "operator") return "Operator Builder";
    if (path === "business_owner") return "Business Systems Builder";
    if (path === "builder" && (hasInterest("AI") || hasInterest("Architecture", "Architectuur"))) return "Infrastructure Builder";
    if (hasInterest("Automation", "Automatisering") || hasInterest("Systems", "Systemen")) return "Systems Builder";
    if (hasInterest("Design") || state.operatorTrait === "taste") return "Experience Builder";
    if (hasInterest("Business")) return "Execution Builder";
    return resolveCurrentResult().replace(/^You\s+/i, "").replace(/\.$/, "") || "Builder";
  }

  function builderIdentityLine() {
    const type = builderType().toLowerCase();
    const source = [
      type,
      state.path || "",
      selectedIndustryLabel(),
      ...(state.interests || [])
    ].join(" ").toLowerCase();
    const lines = lang === "nl"
      ? [
          [/operator/, "Je brengt ideeën naar uitvoering."],
          [/architect|architecture|architectuur|infrastructure/, "Je denkt lang voordat je bouwt."],
          [/automation|automatisering/, "Je haalt herhaling weg voordat het duur wordt."],
          [/business/, "Je zet momentum om in structuur."],
          [/\bai\b|intelligence/, "Je vermenigvuldigt uitvoering met intelligentie."],
          [/design|experience|taste/, "Je maakt systemen menselijk."],
          [/system|systems|systemen/, "Je creëert hefboom."]
        ]
      : [
          [/operator/, "You move ideas into execution."],
          [/architect|architecture|infrastructure/, "You think long before you build."],
          [/automation/, "You remove repetition before it becomes expensive."],
          [/business/, "You turn momentum into structure."],
          [/\bai\b|intelligence/, "You multiply execution with intelligence."],
          [/design|experience|taste/, "You make systems feel human."],
          [/system|systems/, "You create leverage."]
        ];
    const match = lines.find(([pattern]) => pattern.test(source));
    if (match) return match[1];
    return lang === "nl" ? "Je bouwt voordat de wereld bij is." : "You build before the world catches up.";
  }

  function currentStage() {
    const value = String(state.reflection || "").trim();
    const map = {
      "Building my first project": "Building",
      "Growing a business": "Growing",
      "Looking for automation": "Systemizing",
      "Learning AI": "Learning",
      "Just exploring": "Exploring",
      "Planning something bigger": "Planning",
      "Mijn eerste project bouwen": "Building",
      "Een bedrijf laten groeien": "Growing",
      "Op zoek naar automatisering": "Systemizing",
      "AI leren": "Learning",
      "Gewoon verkennen": "Exploring",
      "Iets groters plannen": "Planning"
    };
    return map[value] || value;
  }

  function profileRecommendations() {
    const labels = recommendationLabels(state.path || "curious").map((label) => data.recommendationLabels.en[label] || label);
    const signals = [
      state.path,
      selectedIndustryLabel(),
      ...(state.interests || []),
      ...(Array.isArray(state.goals) ? state.goals : []),
      ...(Array.isArray(state.automate) ? state.automate : state.automate ? [state.automate] : []),
      state.automationOther
    ].join("|").toLowerCase();
    if (signals.includes("lead") || signals.includes("sales") || signals.includes("business")) labels.push("Lead Operating System");
    if (signals.includes("client onboarding")) labels.push("Client Onboarding System");
    return Array.from(new Set(labels)).slice(0, 6);
  }

  function recommendedResources() {
    return profileRecommendations().filter((label) => !["Live", "Viewer Builds"].includes(label)).slice(0, 4);
  }

  function recommendedBuilds() {
    const builds = [];
    if (hasProfileInterest("Automation", "Automatisering")) builds.push("Lead Operating System");
    if (hasProfileInterest("Business")) builds.push("Business Operating System");
    if (hasProfileInterest("AI")) builds.push("AI Workflow Layer");
    if (hasProfileInterest("Architecture", "Architectuur")) builds.push("Architecture Breakdown");
    builds.push("Live Builds", "Viewer Builds");
    return Array.from(new Set(builds)).slice(0, 4);
  }

  function hasProfileInterest(...labels) {
    const interests = new Set(state.interests || []);
    return labels.some((label) => interests.has(label));
  }

  function permanentBuilderNumber(memory = read(memoryKey, {})) {
    const candidate = memory.builderNumber || state.builderNumber || "";
    const value = String(candidate || "").replace(/^#|builder\s*#/i, "").trim();
    return /^\d+$/.test(value) ? value : "";
  }

  function provisionalBuilderNumber(memory = read(memoryKey, {})) {
    const source = String(state.journeyId || memory.journeyId || "").replace(/\D/g, "");
    return source ? source.slice(-6).padStart(3, "0") : "";
  }

  function builderNumberValue() {
    const memory = read(memoryKey, {});
    return permanentBuilderNumber(memory) || provisionalBuilderNumber(memory) || copy[lang].builderPending;
  }

  async function prepareBuilderIdentity() {
    if (pageName() !== "how-it-works") return;
    if (completionPercent() < 100) return;
    const memory = read(memoryKey, {});
    if (permanentBuilderNumber(memory)) return;
    if (state.identityPreparing) return;
    state.identityPreparing = true;
    save(storageKey, state);
    try {
      const response = await fetch("/api/builder-identity", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(builderIdentityPayload({ includeBuilderNumber: false }))
      });
      const result = await response.json().catch(() => ({}));
      const issuedNumber = result.identity?.builderNumber || result.identity_storage?.builder_number || result.identity_storage?.identity?.builder_number;
      if (response.ok && issuedNumber) {
        state.builderNumber = String(issuedNumber);
        state.identityPrepared = true;
        delete state.identityPreparing;
        save(storageKey, state);
        updateMemory({
          builderNumber: String(issuedNumber),
          identityPreparedAt: new Date().toISOString(),
          builderStatus: result.identity?.status || "Founding Builder"
        });
        renderPassport();
        persistVisitorProgress();
        return;
      }
    } catch (error) {}
    delete state.identityPreparing;
    save(storageKey, state);
  }

  function bindWalletActions() {
    const apple = document.getElementById("apple-wallet");
    const google = document.getElementById("google-wallet");
    const note = document.getElementById("wallet-note");
    const handler = () => {
      if (note) note.textContent = copy[lang].walletComingSoon;
      showReward(copy[lang].walletComingSoon);
    };
    if (apple && !apple.dataset.bound) {
      apple.dataset.bound = "true";
      apple.setAttribute("aria-disabled", "true");
      apple.onclick = handler;
    }
    if (google && !google.dataset.bound) {
      google.dataset.bound = "true";
      google.setAttribute("aria-disabled", "true");
      google.onclick = handler;
    }
  }

  function builderIdentityPayload(options = {}) {
    const number = permanentBuilderNumber();
    const payload = {
      pass_kind: "builder",
      journey_id: state.journeyId || "",
      builder_type: builderType(),
      interests: state.interests || [],
      path: pathLabel(state.path),
      automation_choice: automationLines().map((item) => item.replace(/^✓\s*/, "")),
      current_stage: currentStage(),
      identity_line: builderIdentityLine(),
      joined_at: read(memoryKey, {}).joinedAt || state.journeyStartedAt || "",
      completion: completionPercent(),
      status: read(memoryKey, {}).foundingBuilder ? "Founding Builder" : "Builder",
      ...platformLanguagePayload()
    };
    if (options.includeBuilderNumber !== false && number) payload.builder_number = number;
    return payload;
  }

  function normalizeProfileLabel(value) {
    return String(value || "").trim();
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
        state.selectedLanguage = lang;
        save(storageKey, state);
        updateMemory({ language: lang });
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
    state.completed = Array.isArray(state.completed) ? state.completed : [];
    migrateChoice("discover", data.discover);
    migrateChoice("interests", data.interests);
    migrateChoice("goals", data.goals);
    migrateChoice("reflection", data.reflections);
    migrateChoice("automate", data.automate);
    sanitizeProgressState();
    const maxActive = highestContiguousStep();
    const requestedActive = Number(state.activeStep);
    state.unlockedStep = maxActive;
    state.activeStep = Number.isFinite(requestedActive) && requestedActive > 0
      ? Math.min(Math.max(1, requestedActive), maxActive)
      : maxActive;
    if (isStepComplete(Number(state.activeStep))) state.activeStep = maxActive;
    save(storageKey, state);
  }

  function sanitizeProgressState() {
    if (state.progressionVersion !== progressionVersion) {
      const migratedKeys = ["story", "workflow", "example", "goals", "operatorTrait", "reflection", "automate", "gate", "path", "recommendations", "livePreview", "viewerBuilds"];
      state.completed = state.completed.filter((key) => !migratedKeys.includes(key));
      state.example = "";
      state.industry = null;
      state.customIndustry = "";
      state.goals = [];
      state.goalsKeys = [];
      state.operatorTrait = "";
      delete state.reflection;
      state.reflectionKeys = [];
      state.automate = [];
      state.automateKeys = [];
      state.automationOther = "";
      state.path = "";
      state.platformOpened = false;
      state.progressionVersion = progressionVersion;
    }
    state.completed = state.completed.filter((key) => isKnownCompletion(key));
    if (!isValidChoice("discover", data.discover)) {
      delete state.discover;
      state.discoverKeys = [];
      removeComplete("discover");
    }
    if (!hasComplete("discover")) {
      delete state.discover;
      state.discoverKeys = [];
    }
    if (!isValidChoice("interests", data.interests)) {
      state.interests = [];
      state.interestsKeys = [];
      removeComplete("interests");
    }
    if (!hasComplete("interests")) {
      state.interests = [];
      state.interestsKeys = [];
    }
    if (state.example && !industrySelectionReady()) {
      state.example = "";
      state.industry = null;
      state.customIndustry = "";
      removeComplete("example");
    }
    if (!hasComplete("example")) {
      state.example = "";
      state.industry = null;
      state.customIndustry = "";
    }
    if (state.example && industrySelectionReady() && !state.industry) {
      state.industry = state.example === "other"
        ? industryProfile(otherIndustryOption(), state.customIndustry)
        : industryProfile(industryByKey(state.example));
    }
    if (!isValidChoice("goals", data.goals)) {
      state.goals = [];
      state.goalsKeys = [];
      removeComplete("goals");
    }
    if (!hasComplete("goals")) {
      state.goals = [];
      state.goalsKeys = [];
    }
    if (state.operatorTrait && !data.quiz.results[state.operatorTrait]) {
      state.operatorTrait = "";
      removeComplete("operatorTrait");
    }
    if (!hasComplete("operatorTrait")) state.operatorTrait = "";
    if (!isValidChoice("reflection", data.reflections)) {
      delete state.reflection;
      state.reflectionKeys = [];
      removeComplete("reflection");
    }
    if (!hasComplete("reflection")) {
      delete state.reflection;
      state.reflectionKeys = [];
    }
    if (!isValidChoice("automate", data.automate) && !String(state.automationOther || "").trim()) {
      state.automate = [];
      state.automateKeys = [];
      removeComplete("automate");
    }
    if (!hasComplete("automate")) {
      state.automate = [];
      state.automateKeys = [];
      state.automationOther = "";
    }
    if (state.path && !["business_owner", "operator", "builder", "curious"].includes(state.path)) {
      state.path = "";
      removeComplete("path");
    }
    if (!hasComplete("path")) state.path = "";
    let foundGap = false;
    for (let step = 1; step <= progressTotal; step += 1) {
      const key = stepCompletionKeys[step];
      if (foundGap) {
        removeComplete(key);
        clearStepState(key);
        continue;
      }
      if (!isCompletionValid(key)) {
        removeComplete(key);
        foundGap = true;
      }
    }
  }

  function clearStepState(key) {
    switch (key) {
      case "example":
        state.example = "";
        state.industry = null;
        state.customIndustry = "";
        break;
      case "goals":
        state.goals = [];
        state.goalsKeys = [];
        break;
      case "operatorTrait":
        state.operatorTrait = "";
        break;
      case "reflection":
        delete state.reflection;
        state.reflectionKeys = [];
        break;
      case "automate":
        state.automate = [];
        state.automateKeys = [];
        state.automationOther = "";
        break;
      case "path":
        state.path = "";
        state.platformOpened = false;
        break;
      default:
        break;
    }
  }

  function highestContiguousStep() {
    let active = 1;
    for (let step = 1; step <= progressTotal; step += 1) {
      if (!isCompletionValid(stepCompletionKeys[step])) break;
      active = step + 1;
    }
    return Math.min(progressTotal + 1, active);
  }

  function isStepComplete(step) {
    const key = stepCompletionKeys[step];
    return Boolean(key && isCompletionValid(key));
  }

  function isCompletionValid(key) {
    if (!isKnownCompletion(key)) return false;
    switch (key) {
      case "discover":
        return isValidChoice("discover", data.discover) && hasComplete(key);
      case "interests":
        return isValidChoice("interests", data.interests) && hasComplete(key);
      case "story":
      case "workflow":
      case "recommendations":
      case "viewerBuilds":
        return hasComplete(key);
      case "example":
        return Boolean(industrySelectionReady() && hasComplete(key));
      case "goals":
        return isValidChoice("goals", data.goals) && hasComplete(key);
      case "operatorTrait":
        return Boolean(state.operatorTrait && data.quiz.results[state.operatorTrait] && hasComplete(key));
      case "reflection":
        return isValidChoice("reflection", data.reflections) && hasComplete(key);
      case "automate":
        return Boolean(((state.automateKeys || []).length || String(state.automationOther || "").trim()) && hasComplete(key));
      case "gate":
        return Boolean(currentSavedEmail()?.email && currentSavedEmail()?.confirmation?.delivered === true && hasComplete(key));
      case "path":
        return Boolean(["business_owner", "operator", "builder", "curious"].includes(state.path) && hasComplete(key));
      default:
        return false;
    }
  }

  function isKnownCompletion(key) {
    return Object.values(stepCompletionKeys).includes(key);
  }

  function hasComplete(key) {
    return (state.completed || []).includes(key);
  }

  function removeComplete(key) {
    state.completed = (state.completed || []).filter((item) => item !== key);
  }

  function isValidChoice(key, dataset) {
    const selectedKeys = Array.isArray(state[`${key}Keys`]) ? state[`${key}Keys`] : [];
    if (!selectedKeys.length) return false;
    const allowed = new Set();
    Object.values(dataset).forEach((items) => {
      items.forEach((_, index) => allowed.add(`${key}:${index}`));
    });
    return selectedKeys.every((item) => allowed.has(item));
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
    const active = Math.max(1, Math.min(highestContiguousStep(), Number(state.activeStep) || 1));
    state.activeStep = active;
    state.unlockedStep = highestContiguousStep();
    document.body.classList.toggle("is-final-reward", active === progression.viewerBuilds);
    if (renderedActiveStep !== active) {
      renderedActiveStep = active;
      activeStepReadyAt = Date.now() + 1600;
    }
    document.querySelectorAll("[data-step]").forEach((section) => {
      const step = Number(section.dataset.step);
      section.hidden = step > active;
      section.inert = step !== active;
      section.classList.toggle("is-active", step === active);
      section.classList.toggle("is-complete", step < active);
      if (step === active) {
        section.setAttribute("aria-current", "step");
      } else {
        section.removeAttribute("aria-current");
      }
    });
    renderCompletedSummaries();
  }

  function renderCompletedSummaries() {
    document.querySelectorAll(".completed-summary").forEach((node) => node.remove());
    document.querySelectorAll(".experience-step.is-complete[data-step]").forEach((section) => {
      const summary = summaryForStep(Number(section.dataset.step));
      if (!summary) return;
      const head = section.querySelector(".step-head");
      if (!head) return;
      const node = document.createElement("p");
      node.className = "completed-summary";
      if (stepCompletionKeys[Number(section.dataset.step)] === "gate") {
        const email = currentSavedEmail()?.email || "";
        node.innerHTML = `${escapeHtml(copy[lang].emailConfirmedTitle)} ✓${email ? `<span>${escapeHtml(email)}</span>` : ""}`;
      } else {
        const insight = insightForStep(Number(section.dataset.step));
        node.innerHTML = `${escapeHtml(summary)} ✓${insight ? `<span>${escapeHtml(insight)}</span>` : ""}`;
      }
      head.appendChild(node);
    });
  }

  function insightForStep(step) {
    const interests = (state.interests || []).join(" ").toLowerCase();
    const automate = [...(Array.isArray(state.automate) ? state.automate : []), state.automationOther || ""].join(" ").toLowerCase();
    const path = state.path || "";
    const lines = lang === "nl"
      ? {
          discover: "Je kwam binnen via nieuwsgierigheid.",
          systems: "Je denkt in systemen.",
          execution: "Je waardeert uitvoering boven complexiteit.",
          workflow: "Je ziet waar werk vastloopt.",
          example: "Je koppelt systemen aan echte werelden.",
          goals: "Je kiest waar de hefboom moet komen.",
          operator: "Je let op eigenaarschap.",
          stage: "Je weet waar je nu staat.",
          automation: "Je zoekt hefboom in herhaling.",
          identity: "Je builder identity is vastgelegd."
        }
      : {
          discover: "You arrived through curiosity.",
          systems: "You naturally think in systems.",
          execution: "You value execution over complexity.",
          workflow: "You notice where work gets stuck.",
          example: "You connect systems to real worlds.",
          goals: "You choose where the leverage should land.",
          operator: "You pay attention to ownership.",
          stage: "You know where you are right now.",
          automation: "You look for leverage in repetition.",
          identity: "Your builder identity is now recorded."
        };
    if (step === 1) return lines.discover;
    if (step === 2) return interests.includes("automation") || interests.includes("systems") || interests.includes("systemen") ? lines.systems : lines.execution;
    if (step === 3 || step === 4) return lines.workflow;
    if (step === 5) return lines.example;
    if (step === 6) return lines.goals;
    if (step === 7 || path === "operator") return lines.operator;
    if (step === 8) return lines.stage;
    if (step === 9 || automate) return lines.automation;
    if (step >= 11) return lines.identity;
    return "";
  }

  function summaryForStep(step) {
    switch (step) {
      case 1:
        return choiceLabels("discover", data.discover).join(", ");
      case 2:
        return choiceLabels("interests", data.interests).join(", ");
      case 3:
        return lang === "nl" ? "Besturingssystemen" : "Operating systems";
      case 4:
        return copy[lang].newWorkflow;
      case 5:
        return selectedIndustryLabel();
      case 6:
        return choiceLabels("goals", data.goals).join(", ");
      case 7:
        return state.operatorTrait && data.quiz.traits[state.operatorTrait] ? data.quiz.traits[state.operatorTrait][lang] : "";
      case 8:
        return choiceLabels("reflection", data.reflections).join(", ");
      case 9: {
        const answers = choiceLabels("automate", data.automate);
        if (state.automationOther) answers.push(state.automationOther);
        return answers.join(", ");
      }
      case 10:
        return currentSavedEmail()?.email || copy[lang].emailConfirmedTitle;
      case 11:
        return document.getElementById("personal-title")?.textContent || "";
      case 12:
        const builds = read("doneovernight.viewerBuilds.v1", []);
        return builds[builds.length - 1]?.idea || copy[lang].skipViewerBuild;
      default:
        return "";
    }
  }

  function choiceLabels(key, dataset) {
    const selectedKeys = Array.isArray(state[`${key}Keys`]) ? state[`${key}Keys`] : [];
    return selectedKeys.map((item) => {
      const index = Number(String(item).split(":")[1]);
      return dataset[lang]?.[index] || "";
    }).filter(Boolean);
  }

  function pathLabel(path) {
    const keys = ["business_owner", "operator", "builder", "curious"];
    const index = keys.indexOf(path);
    return index >= 0 ? data.paths[lang][index] : "";
  }

  function unlockStep(step, scroll = true) {
    const maxActive = highestContiguousStep();
    const next = Math.min(step, maxActive);
    state.unlockedStep = maxActive;
    state.activeStep = next;
    save(storageKey, state);
    applyUnlockedSteps();
    renderProgress();
    renderPassport();
    persistVisitorProgress();
    const target = document.querySelector(`[data-step="${step}"]`);
    if (target) {
      target.classList.add("is-unlocking");
      setTimeout(() => target.classList.remove("is-unlocking"), 800);
      if (scroll) scheduleStepScroll(target, 180);
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
    const target = document.querySelector(`[data-step="${progression.gate}"]`);
    if (target) {
      target.classList.add("is-unlocking");
      setTimeout(() => target.classList.remove("is-unlocking"), 800);
      if (scroll) scheduleStepScroll(target, 360);
    }
  }

  function completePath() {
    markComplete("path");
    state.unlockedStep = Math.max(Number(state.unlockedStep) || 1, progression.path);
    state.activeStep = progression.path;
    save(storageKey, state);
    applyUnlockedSteps();
    renderProgress();
    renderPassport();
    persistVisitorProgress();
    showReward();
    const target = document.querySelector(`[data-step="${progression.recommendations}"]`);
    if (target) {
      target.classList.add("is-unlocking");
      setTimeout(() => target.classList.remove("is-unlocking"), 800);
      scheduleStepScroll(target, 180);
    }
  }

  function bindAutoUnlocks() {
    window.removeEventListener("scroll", window.__doneOvernightAutoUnlock);
    window.__doneOvernightAutoUnlock = null;
  }

  function completeInteraction(key, nextStep, scroll = true) {
    const current = Number(state.activeStep) || 1;
    if (stepCompletionKeys[current] !== key) return false;
    if (Number(nextStep) !== current + 1) return false;
    markComplete(key);
    unlockStep(nextStep, scroll);
    showReward();
    return true;
  }

  function completeInteractionAfterFeedback(key, nextStep, trigger, scroll = true) {
    if (interactionLocked) return false;
    const current = Number(state.activeStep) || 1;
    if (stepCompletionKeys[current] !== key || Number(nextStep) !== current + 1) return false;
    interactionLocked = true;
    trigger?.classList.add("is-pressing", "is-confirmed");
    window.setTimeout(() => {
      trigger?.classList.remove("is-pressing");
      const hasInsight = revealActiveInsight(current, trigger);
      window.setTimeout(() => {
        completeInteraction(key, nextStep, scroll);
        interactionLocked = false;
      }, hasInsight ? insightDwellMs : tapFeedbackMs);
    }, tapFeedbackMs);
    return true;
  }

  function revealActiveInsight(step, trigger) {
    const insight = insightForStep(step);
    if (!insight) return false;
    const section = trigger?.closest("[data-step]") || document.querySelector(`[data-step="${step}"]`);
    if (!section) return false;
    section.querySelectorAll(".active-insight").forEach((node) => node.remove());
    const node = document.createElement("p");
    node.className = "active-insight";
    node.textContent = insight;
    const anchor = trigger?.closest(".choice-card, .quiz-option, .tab-pill, .quiet-action, .next-unlock");
    if (anchor && anchor.parentNode && section.contains(anchor)) {
      anchor.insertAdjacentElement("afterend", node);
    } else {
      (section.querySelector(".step-head") || section).appendChild(node);
    }
    window.requestAnimationFrame(() => node.classList.add("is-visible"));
    return true;
  }

  function clearActiveInsights() {
    document.querySelectorAll(".active-insight").forEach((node) => {
      node.classList.remove("is-visible");
      window.setTimeout(() => node.remove(), 260);
    });
  }

  function canInteract(element) {
    if (interactionLocked) return false;
    const section = element.closest("[data-step]");
    if (!section) return true;
    return Boolean(section && !section.hidden && section.classList.contains("is-active") && Number(section.dataset.step) === Number(state.activeStep));
  }

  function markComplete(key) {
    clearActiveInsights();
    state.completed = Array.isArray(state.completed) ? state.completed : [];
    if (!state.completed.includes(key)) state.completed.push(key);
    save(storageKey, state);
    updateMemory({
      completion: completionPercent(),
      chosenPath: state.path || "",
      chosenInterests: state.interests || [],
      industry: state.industry || null,
      goals: state.goals || [],
      automationChoice: [...(Array.isArray(state.automate) ? state.automate : []), state.automationOther].filter(Boolean),
      source: state.discover || "",
      foundingBuilder: completionPercent() >= 100 || read(memoryKey, {}).foundingBuilder === true,
      builderRank: completionPercent() >= 100 ? "Builder" : read(memoryKey, {}).builderRank || "Explorer"
    });
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
    const memory = read(memoryKey, {});
    note.hidden = false;
    note.innerHTML = returnVisitorMarkup({
      pct,
      previousVisit: memory.previousVisit,
      since: [
        memory.livePageVisits ? `${memory.livePageVisits} ${copy[lang].liveVisits.toLowerCase()}` : "",
        (memory.resourcesOpened || []).length ? `${(memory.resourcesOpened || []).length} ${copy[lang].resourcesOpened.toLowerCase()}` : "",
        (memory.viewerBuilds || []).length ? `${(memory.viewerBuilds || []).length} Viewer Build${(memory.viewerBuilds || []).length === 1 ? "" : "s"}` : ""
      ].filter(Boolean)
    });
    typeReturnVisitor(note);
  }

  async function hydrateReturnVisitor() {
    const note = document.getElementById("return-note");
    if (!note || !state.journeyId) return;
    const data = await fetchPlatformData(`view=visitor&journey_id=${encodeURIComponent(state.journeyId)}`);
    if (!data.ok || !data.journey) return;
    if (data.identity?.builder_number) {
      state.builderNumber = String(data.identity.builder_number);
      save(storageKey, state);
      updateMemory({
        builderNumber: String(data.identity.builder_number),
        builderStatus: data.identity.status || "Founding Builder",
        builderType: data.identity.builder_type || read(memoryKey, {}).builderType || ""
      });
    }
    const pct = Math.max(completionPercent(), Number(data.journey.completion_percentage || 0));
    note.hidden = false;
    note.innerHTML = returnVisitorMarkup({
      pct,
      previousVisit: read(memoryKey, {}).previousVisit,
      since: [
        formatCount(data.latest_deployments_count, copy[lang].deployment, copy[lang].deployments),
        formatCount(data.new_journal_entries, copy[lang].journalUpdate, copy[lang].journalUpdates),
        formatCount(data.viewer_builds_count, "Viewer Build", "Viewer Builds"),
        formatCount(data.resource_interest_count, copy[lang].resourcesOpened.toLowerCase(), copy[lang].resourcesOpened.toLowerCase())
      ].filter(Boolean)
    });
    typeReturnVisitor(note);
  }

  function typeReturnVisitor(note) {
    if (!note) return;
    const nodes = Array.from(note.querySelectorAll("span, strong, small"));
    if (!nodes.length) return;
    const signature = nodes.map((node) => node.textContent || "").join("|");
    if (note.dataset.typed === "true" && note.dataset.typedSignature === signature) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      note.dataset.typed = "true";
      note.dataset.typedSignature = signature;
      return;
    }
    const run = `${Date.now()}:${lang}`;
    note.dataset.typeRun = run;
    note.dataset.typed = "false";
    note.classList.add("is-typing");
    nodes.forEach((node) => {
      const text = node.textContent || "";
      node.dataset.typeText = text;
      node.style.minWidth = `${Math.ceil(node.getBoundingClientRect().width)}px`;
      node.textContent = "";
    });
    let nodeIndex = 0;
    let charIndex = 0;
    const tick = () => {
      if (note.dataset.typeRun !== run) return;
      nodes.forEach((node) => node.classList.remove("is-typing-caret"));
      const node = nodes[nodeIndex];
      if (!node) {
        note.classList.remove("is-typing");
        note.dataset.typed = "true";
        note.dataset.typedSignature = signature;
        nodes.forEach((item) => {
          item.classList.remove("is-typing-caret");
          item.style.minWidth = "";
        });
        return;
      }
      const text = node.dataset.typeText || "";
      node.classList.add("is-typing-caret");
      node.textContent = text.slice(0, charIndex);
      charIndex += 1;
      if (charIndex > text.length) {
        node.textContent = text;
        node.classList.remove("is-typing-caret");
        nodeIndex += 1;
        charIndex = 0;
        window.setTimeout(tick, 90);
        return;
      }
      window.setTimeout(tick, node.tagName === "STRONG" ? 42 : 24);
    };
    tick();
  }

  function formatCount(value, singular, plural) {
    const count = Number(value || 0);
    if (!count) return "";
    return `${count} ${count === 1 ? singular : plural}`;
  }

  function returnVisitorMarkup({ pct, previousVisit, since = [] }) {
    const lastVisit = previousVisit ? formatDate(previousVisit) : "";
    const sinceText = since.length ? since.join(" · ") : copy[lang].continueJourney;
    const memory = read(memoryKey, {});
    const builder = permanentBuilderNumber(memory);
    const greeting = builder ? `${copy[lang].welcomeBack.replace(/\.$/, "")} Builder #${builder}.` : copy[lang].welcomeBack;
    return `
      <span>${escapeHtml(greeting)}</span>
      <strong>${escapeHtml(`${pct}%`)}</strong>
      ${lastVisit ? `<small>${escapeHtml(copy[lang].lastVisit)} ${escapeHtml(lastVisit)}</small>` : ""}
      <small>${escapeHtml(copy[lang].sinceLastVisit)} ${escapeHtml(sinceText)}</small>
    `;
  }

  function trackPageLifecycle() {
    const enteredAt = new Date().toISOString();
    postPlatformEvent({
      event: "page_entered",
      page: pageName(),
      entered_at: enteredAt,
      referrer: document.referrer || "",
      source: state.discover || "",
      metadata: {
        path: window.location.pathname,
        language: lang
      }
    });
    const sendLeft = () => {
      const duration = Math.max(0, Math.round((Date.now() - Date.parse(enteredAt)) / 1000));
      const memory = read(memoryKey, {});
      updateMemory({ timeSpent: Number(memory.timeSpent || 0) + duration });
      const payload = platformPayload({
        event: "page_left",
        page: pageName(),
        entered_at: enteredAt,
        left_at: new Date().toISOString(),
        duration,
        referrer: document.referrer || "",
        source: state.discover || "",
        metadata: {
          path: window.location.pathname,
          language: lang
        }
      });
      try {
        const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
        navigator.sendBeacon?.("/api/platform-events", blob);
      } catch (error) {}
    };
    window.addEventListener("pagehide", sendLeft, { once: true });
  }

  async function fetchPlatformData(view) {
    try {
      const target = String(view || "");
      const viewText = String(view || "live");
      const query = viewText.includes("=")
        ? viewText
        : viewText.includes("&")
          ? `view=${viewText}`
          : `view=${encodeURIComponent(viewText)}`;
      const response = await fetch(`/api/platform-data?${query}`, {
        credentials: "same-origin",
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401 && (target === "hq" || target.startsWith("hq&") || target.includes("view=hq"))) {
        window.location.replace(`/hq/login?return=${encodeURIComponent(window.location.pathname || "/hq")}`);
        return { ok: false, placeholder: true, error: "unauthorized" };
      }
      return response.ok ? data : { ok: false, placeholder: true, error: data.error || "unavailable" };
    } catch (error) {
      return { ok: false, placeholder: true, error: "network_error" };
    }
  }

  async function hydrateLiveData() {
    const data = await fetchPlatformData("live");
    if (!data.ok || data.placeholder || !data.live_status) {
      const waiting = platformSignal?.live_waiting || {};
      mountList("today-list", [
        waiting.activity || "Waiting for today's deployment.",
        `Journey count today: ${Number(data.journey_count_today || 0)}`
      ]);
      return;
    }
    const row = data.live_status;
    fill("[data-live='build']", row.current_build || live.build);
    fill("[data-live='operator']", row.current_operator || live.operator);
    fill("[data-live='project']", row.current_project || row.current_client || live.project);
    fill("[data-live='repository']", row.current_repository || live.repository);
    fill("[data-live='branch']", row.current_branch || live.branch);
    fill("[data-live='commit']", row.current_commit || live.commit);
    fill("[data-live='heartbeat']", row.heartbeat || live.heartbeat);
    fill("[data-live='repositoryStatus']", row.repository_status || live.repositoryStatus);
    fill("[data-live='deployment']", row.latest_deployment || live.deployment);
    fill("[data-live='completion']", row.estimated_completion || live.completion);
    fill("[data-live='lastUpdate']", row.last_update || row.updated_at || live.lastUpdate);
    fill("[data-live='focus']", row.current_focus || live.focus);
    fill("[data-live='progressLabel']", row.current_progress || live.progressLabel);
    const bar = document.querySelector("[data-live-progress]");
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, Number(row.progress_percentage || 0)))}%`;
    mountList("today-list", (row.recent_activity || []).concat(data.viewer_queue?.map((item) => `Viewer Build: ${item.title}`) || []).slice(0, 6));
    mountList("wins-list", row.latest_wins || []);
    mountList("finished-list", row.recently_finished || []);
    mountList("upcoming-list", row.upcoming_builds || []);
    document.querySelectorAll(".placeholder-badge").forEach((node) => {
      node.textContent = row.placeholder === true ? copy[lang].placeholder : "Connected";
    });
  }

  async function hydrateJournalData() {
    const root = document.querySelector(".journal-list");
    if (!root) return;
    updateMemory({
      journalEntriesViewed: Array.from(new Set([...(read(memoryKey, {}).journalEntriesViewed || []), "journal"].filter(Boolean))),
      lastJournalViewedAt: new Date().toISOString()
    });
    const data = await fetchPlatformData("journal");
    if (!data.ok || data.placeholder || !Array.isArray(data.entries) || !data.entries.length) return;
    root.innerHTML = data.entries.map((entry) => `
      <article class="journal-entry">
        <div>
          <div class="journal-meta">
            <span class="status-badge is-development">${entry.entry_type || "Deployment"}</span>
            <span class="placeholder-badge">Connected</span>
          </div>
          <h2>${escapeHtml(entry.title || "Journal entry")}</h2>
          <p>${escapeHtml(entry.body || entry.summary || "")}</p>
        </div>
      </article>
    `).join("");
  }

  function mountResourceInterest() {
    document.querySelectorAll(".notify-link").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const card = link.closest(".resource-card");
        const resource = link.dataset.resource || card?.querySelector("h2")?.textContent || "";
        const product = link.dataset.product || document.body.dataset.productPage || "";
        const category = link.dataset.category || card?.dataset.resourceCategory || card?.dataset.resourceSignal || "";
        const status = link.dataset.status || card?.dataset.resourceStatus || "notify_me";
        const access = card?.dataset.access || card?.dataset.librarySection || "";
        const memory = read(memoryKey, {});
        updateMemory({
          resourcesOpened: Array.from(new Set([...(memory.resourcesOpened || []), resource].filter(Boolean))),
          recentlyViewed: Array.from(new Set([resource, ...(memory.recentlyViewed || [])].filter(Boolean))).slice(0, 8),
          lastResourceOpenedAt: new Date().toISOString()
        });
        postPlatformEvent({
          event: "resource_interest",
          resource,
          product,
          category,
          access,
          builder_number: permanentBuilderNumber(memory),
          page: pageName(),
          source_page: pageName(),
          status
        });
        showReward("Interest saved.");
        window.setTimeout(() => {
          window.location.href = link.href;
        }, 160);
      });
    });
  }

  function mountLibrary() {
    const memory = read(memoryKey, {});
    const builder = permanentBuilderNumber(memory);
    fill("#library-builder-number", builder ? `Builder #${builder}` : "Builder pending");
    fill("#library-builder-type", memory.builderType || builderType());
    const interests = Array.isArray(memory.chosenInterests) ? memory.chosenInterests : state.interests || [];
    const signal = interests.join(" ").toLowerCase();
    const recommended = signal.includes("automation")
      ? "Recommended: Automation Pack, Lead Operating System."
      : signal.includes("architecture")
        ? "Recommended: Deployment Breakdowns, Operating Systems."
        : signal.includes("business")
          ? "Recommended: Lead Operating System, Templates."
          : "Unlocked: Automation, Prompt Packs, Journal.";
    fill("#library-builder-line", recommended);
  }

  async function mountHq() {
    const root = document.getElementById("hq-root");
    if (!root) return;
    try {
      localStorage.removeItem("doneovernight.hqAccess.v1");
    } catch (error) {}
    const showTests = read("doneovernight.hqShowTests.v1", false) === true;
    const data = await fetchPlatformData(showTests ? "hq&show_tests=1" : "hq");
    if (!data.ok) {
      root.innerHTML = `<section class="viewer-panel"><span class="eyebrow">Private</span><h1 class="step-title">HQ locked.</h1><p class="step-copy">Access is private. Redirecting to HQ login.</p></section>`;
      return;
    }
    const metrics = data.metrics || {};
    root.innerHTML = `
      <section class="live-hero">
        <div>
          <span class="eyebrow">DONEOVERNIGHT HQ</span>
          <h1 class="display">Headquarters.</h1>
          <p class="lede">${data.placeholder ? "Some tables are still placeholders until Supabase is connected." : "Live platform signal from Supabase."}</p>
          <div class="hq-purpose" aria-label="Admin and HQ purpose">
            <span>HQ = platform intelligence / live status</span>
            <span>Admin = operations</span>
          </div>
        </div>
        <div class="hq-profile">
          <a class="open-live" href="/live">Live</a>
          <a class="open-live hq-admin-link" href="https://admin.doneovernight.com" aria-label="Open DONEOVERNIGHT Admin">
            <span>Open Admin</span>
            <small>Manage clients, tasks, operators, email flows, and internal operations.</small>
          </a>
          <button class="open-live hq-logout" type="button" id="hq-logout">Logout</button>
        </div>
      </section>
      <label class="hq-toggle"><input type="checkbox" id="show-test-records" ${showTests ? "checked" : ""}> Show test records</label>
      <section class="activity-grid" aria-label="DONEOVERNIGHT HQ analytics">
        ${hqMetric("Today's Journeys", metrics.todays_journeys)}
        ${hqMetric("Completed Journeys", metrics.completed_journeys)}
        ${hqMetric("Emails Sent", metrics.emails_sent)}
        ${hqMetric("Email Opens", metrics.email_opens)}
        ${hqMetric("Viewer Builds", metrics.viewer_builds)}
        ${hqMetric("Builder Cards", metrics.builder_cards)}
        ${hqMetric("Wallet Passes", metrics.wallet_passes)}
        ${hqMetric("Average Completion", `${metrics.average_completion || 0}%`)}
        ${hqMetric("Current Live Visitors", metrics.current_live_visitors)}
        ${hqList("Most Chosen Interests", data.most_chosen_interests)}
        ${hqList("Most Chosen Path", data.most_chosen_path)}
        ${hqList("Languages", data.languages)}
        ${hqList("Traffic Sources", data.traffic_sources)}
        ${hqList("Recent Builds", (data.recent_builds || []).map((item) => ({ label: item.title, count: hqLanguageCount(item, item.status || "submitted") })))}
        ${hqList("Email Events", (data.recent_emails || []).map((item) => ({ label: item.email || item.journey_id || "Email event", count: hqLanguageCount(item, item.status || "event") })))}
        ${hqList("Recent Resources", (data.recent_resources || []).map((item) => ({ label: item.resource, count: item.status || "notify" })))}
        ${hqList("Recent Journal Entries", (data.recent_journal_entries || []).map((item) => ({ label: item.title, count: item.entry_type || "entry" })))}
      </section>
      ${hqIdentityPanel(data.wallet_status || {})}
      ${hqLibraryPanel(data)}
      ${liveStatusForm(data.current_live_status || {})}
    `;
    bindLiveStatusForm();
    bindHqTestToggle();
    bindHqLogout();
  }

  function hqMetric(label, value) {
    return `<article class="activity-card"><h2>${label}</h2><strong>${value ?? 0}</strong></article>`;
  }

  function hqList(label, items = []) {
    const rows = items.length ? items : [{ label: "Waiting for platform signal", count: "" }];
    return `<article class="activity-card wide"><h2>${label}</h2><ul>${rows.map((item) => `<li>${escapeHtml(item.label || "")}${item.count !== "" && item.count !== undefined ? ` <span>${escapeHtml(String(item.count))}</span>` : ""}</li>`).join("")}</ul></article>`;
  }

  function hqLanguageCount(item = {}, fallback = "") {
    const language = String(item.hq_language || item.email_language || item.selected_language || "").trim().toUpperCase();
    return language ? `Language: ${language}` : fallback;
  }

  function hqIdentityPanel(status = {}) {
    const counts = status.counts || {};
    const founder = status.founder_pass || null;
    const appleSigning = status.apple_signing?.founder || {};
    const appleMissing = Array.isArray(appleSigning.missing) ? appleSigning.missing : [];
    const appleConfigured = appleSigning.configured === true;
    const builderCards = status.builder_cards || [];
    const builderPasses = status.builder_passes || [];
    const notConnected = status.placeholders?.builder_identities || status.placeholders?.wallet_passes;
    const founderStatus = founder ? "Issued" : "Prepared";
    const founderSigned = founder?.signed === true;
    const founderProvider = founder?.provider ? `${founder.provider} · ` : "";
    const builderIssued = Number(counts.builder_issued ?? builderPasses.filter((item) => item.status === "issued").length);
    return `
      <section class="viewer-panel live-status-writer" aria-label="Identity">
        <div class="step-head">
          <span class="step-number">Identity</span>
          <h2 class="step-title">Identity.</h2>
          <p class="step-copy">${notConnected ? "Identity tables are ready in code. Apply the Phase 11 migration to store issued passes." : "Founder and Builder passes, issued identities, and wallet readiness."}</p>
        </div>
        <section class="identity-status-grid" aria-label="Wallet identity status">
          <article class="identity-status-card">
            <span>Founder Pass</span>
            <strong>${founderStatus}</strong>
            <small>${founder ? `${founderProvider}${founderSigned ? "signed" : "unsigned · certificates required"}` : "Ready to issue."}</small>
          </article>
          <article class="identity-status-card">
            <span>Apple Signing</span>
            <strong>${appleConfigured ? "Configured" : "Certificates required"}</strong>
            <small>${appleConfigured ? "Signed Founder Pass delivery is available." : `Missing: ${appleMissing.map(escapeHtml).join(", ") || "Apple Wallet env vars"}`}</small>
          </article>
          <article class="identity-status-card">
            <span>Builder Passes</span>
            <strong>${builderIssued ? `${builderIssued} issued` : "Waiting"}</strong>
            <small>${builderIssued ? "Unsigned until wallet credentials." : "Waiting for first Builder."}</small>
          </article>
          ${hqIdentityRows("Recent Builder Cards", builderCards.map((item) => ({
            title: item.builder_number ? `Builder #${item.builder_number}` : item.journey_id || "Builder",
            detail: [item.builder_type, item.status || "Founding Builder"].filter(Boolean).join(" · ") || "Founding Builder"
          })))}
          ${hqIdentityRows("Recent Wallet Passes", [founder, ...builderPasses].filter(Boolean).map((item) => ({
            title: item.pass_kind === "founder" ? "Founder" : item.builder_number ? `Builder #${item.builder_number}` : item.serial_number || "Builder",
            detail: `${walletStatusLabel(item.status)}${item.signed ? "" : " · Unsigned until credentials"}`
          })))}
          ${hqIdentityRows("Identity Types", [
            { title: "Founder", detail: "Wallet Pass · Profile · Platform history" },
            { title: "Builder", detail: "Wallet Pass · Builder Profile · Resources" },
            { title: "Operator", detail: "Future permissions · Delivery history" },
            { title: "Client", detail: "Future workspace · Project history" },
            { title: "Partner", detail: "Future access · Shared systems" }
          ])}
        </section>
        <p class="form-note">Founder QR/NFC destination: /don. Use this page for QR/NFC sharing until signed Wallet delivery is configured.</p>
        <div class="live-status-actions">
          <a class="quiet-action secondary" href="/don">Open /don</a>
          <a class="quiet-action secondary" href="/api/builder-wallet/apple?type=founder">${appleConfigured ? "Signed Founder Pass" : "Founder Apple Payload"}</a>
          <a class="quiet-action secondary" href="/api/builder-wallet/google?type=founder">Founder Google Payload</a>
          <a class="quiet-action secondary" href="/api/builder-wallet/apple?type=builder">Builder Pass</a>
        </div>
      </section>
    `;
  }

  function hqIdentityRows(title, rows = []) {
    const items = rows.length ? rows : [{ title: "Waiting for first Builder.", detail: "" }];
    return `
      <article class="identity-status-card identity-status-card-wide">
        <span>${escapeHtml(title)}</span>
        <ul class="identity-row-list">
          ${items.map((item) => `<li><strong>${escapeHtml(item.title || "")}</strong>${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}</li>`).join("")}
        </ul>
      </article>
    `;
  }

  function hqLibraryPanel(data = {}) {
    const resources = data.recent_resources || [];
    const categories = ["Automation", "AI", "Repositories", "Prompt Packs", "Operating Systems", "Templates", "UI Components", "Internal Notes", "SOPs", "Case Studies", "Deployment Breakdowns", "Journal"];
    const products = ["Lead Operating System", "Restaurant OS", "Builder Pack", "Prompt Pack", "Automation Pack", "Repository"];
    const states = ["Research", "Planning", "Building", "Testing", "Released", "Archived"];
    const builderHomes = (data.recent_builders || data.wallet_status?.recent_builder_cards || []).slice(0, 6);
    return `
      <section class="viewer-panel live-status-writer" aria-label="Library">
        <div class="step-head">
          <span class="step-number">Library</span>
          <h2 class="step-title">Builder ecosystem.</h2>
          <p class="step-copy">Builder Homes, activity, products, categories, resource states, and Builder interest. Management remains lightweight until the backend editor is needed.</p>
        </div>
        <section class="identity-status-grid" aria-label="Library management">
          ${hqIdentityRows("Builder Homes", builderHomes.length ? builderHomes.map((item) => ({
            title: item.builder_number ? `Builder #${item.builder_number}` : item.journey_id || "Builder",
            detail: item.builder_type || item.status || "Recently active"
          })) : [{ title: "Waiting for first Builder Home", detail: "Future activity layer" }])}
          ${hqIdentityRows("Builder Activity", [
            { title: "Recently Active Builders", detail: "Future support" },
            { title: "Progression", detail: "Explorer -> Builder -> Operator -> Founder -> Partner" }
          ])}
          ${hqIdentityRows("Products", products.map((title) => ({ title, detail: title === "Lead Operating System" || title === "Automation Pack" ? "Building" : "Prepared" })))}
          ${hqIdentityRows("Categories", categories.map((title) => ({ title, detail: "Expandable" })))}
          ${hqIdentityRows("States", states.map((title) => ({ title, detail: title === "Released" ? "Visible when shipped" : "Roadmap" })))}
          ${hqIdentityRows("Recent Product Interest", resources.slice(0, 8).map((item) => ({
            title: item.product || item.resource || "Resource",
            detail: [item.category, item.status, item.builder_number ? `Builder #${item.builder_number}` : ""].filter(Boolean).join(" · ") || "notify_me"
          })))}
        </section>
        <div class="live-status-actions">
          <a class="quiet-action secondary" href="/library">Open Library</a>
          <a class="quiet-action secondary" href="/products">Open Products</a>
          <a class="quiet-action secondary" href="/case-studies">Case Studies</a>
        </div>
      </section>
    `;
  }

  function walletStatusLabel(status = "") {
    const value = String(status || "").trim().toLowerCase();
    const labels = {
      prepared: "Prepared",
      issued: "Issued",
      downloaded: "Downloaded",
      active: "Active",
      revoked: "Revoked",
      expired: "Expired"
    };
    return labels[value] || "Issued";
  }

  function liveStatusForm(status = {}) {
    const progress = status.progress_percentage || "";
    return `
      <section class="viewer-panel live-status-writer" aria-label="Live status writer">
        <div class="step-head">
          <span class="step-number">Internal</span>
          <h2 class="step-title">Live Status.</h2>
          <p class="step-copy">Update the current build signal. Empty fields stay calm on Live.</p>
        </div>
        <form id="live-status-form" class="live-status-form">
          ${liveStatusInput("current_build", "Current Build", status.current_build)}
          ${liveStatusInput("current_operator", "Current Operator", status.current_operator)}
          ${liveStatusInput("current_project", "Current Project", status.current_project || status.current_client)}
          ${liveStatusInput("current_focus", "Current Focus", status.current_focus)}
          ${liveStatusInput("progress", "Progress", status.current_progress || progress)}
          ${liveStatusInput("estimated_completion", "Estimated Completion", status.estimated_completion)}
          ${liveStatusInput("current_branch", "Current Branch", status.current_branch)}
          ${liveStatusInput("current_commit", "Current Commit", status.current_commit)}
          ${liveStatusInput("heartbeat", "Heartbeat", status.heartbeat)}
          ${liveStatusInput("repository_status", "Repository Status", status.repository_status)}
          ${liveStatusInput("last_update", "Last Update", status.updated_at)}
          ${liveStatusTextarea("recent_activity", "Recent Activity", status.recent_activity)}
          ${liveStatusTextarea("latest_wins", "Latest Wins", status.latest_wins)}
          ${liveStatusTextarea("upcoming_builds", "Upcoming Builds", status.upcoming_builds)}
          <div class="live-status-actions">
            <button class="quiet-action" type="submit" value="save_live_status">Save Live Status</button>
            <button class="quiet-action secondary" type="submit" value="send_heartbeat">Send Heartbeat</button>
            <button class="quiet-action secondary" type="submit" value="clear_live_status">Clear Live Status</button>
          </div>
          <div class="form-note" id="live-status-note" aria-live="polite"></div>
        </form>
      </section>
    `;
  }

  function liveStatusInput(name, label, value = "") {
    return `<label class="field-label">${escapeHtml(label)}<input class="text-field" name="${escapeAttr(name)}" value="${escapeAttr(value || "")}"></label>`;
  }

  function liveStatusTextarea(name, label, value = []) {
    const text = Array.isArray(value) ? value.join("\n") : value || "";
    return `<label class="field-label">${escapeHtml(label)}<textarea class="text-field" name="${escapeAttr(name)}">${escapeHtml(text)}</textarea></label>`;
  }

  function bindLiveStatusForm() {
    const form = document.getElementById("live-status-form");
    const note = document.getElementById("live-status-note");
    if (!form) return;
    form.onsubmit = async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(form).entries());
      const action = event.submitter?.value || "save_live_status";
      payload.action = action;
      if (action === "send_heartbeat" && !payload.heartbeat) payload.heartbeat = new Date().toISOString();
      const progressNumber = Number(payload.progress);
      if (Number.isFinite(progressNumber)) payload.progress_percentage = progressNumber;
      if (note) {
        note.textContent = action === "clear_live_status" ? "Clearing live status..." : "Updating live status...";
        note.classList.remove("is-success");
      }
      try {
        const response = await fetch("/api/live-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          credentials: "same-origin",
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.saved !== true) throw new Error(result.reason || result.error || "live_status_failed");
        if (note) {
          note.textContent = action === "clear_live_status" ? "Live status cleared." : "Live status updated.";
          note.classList.add("is-success");
        }
        showReward(action === "clear_live_status" ? "Live cleared." : "Live updated.");
        setTimeout(() => mountHq(), 700);
      } catch (error) {
        if (note) note.textContent = "Live status could not be updated.";
      }
    };
  }

  async function mountHqLogin() {
    const root = document.getElementById("hq-login-root");
    const form = document.getElementById("hq-login-form");
    const note = document.getElementById("hq-login-note");
    const label = document.querySelector("[data-login-label]");
    if (!root || !form) return;
    try {
      localStorage.removeItem("doneovernight.hqAccess.v1");
    } catch (error) {}
    const session = await fetch("/api/hq-session", { credentials: "same-origin", cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .catch(() => null);
    if (session?.ok) {
      window.location.replace("/hq");
      return;
    }
    form.onsubmit = async (event) => {
      event.preventDefault();
      const password = String(form.password.value || "").trim();
      const button = form.querySelector("button");
      if (!password) return;
      if (button) button.disabled = true;
      root.classList.remove("is-denied");
      form.classList.add("is-checking");
      if (label) label.textContent = "Checking access...";
      if (note) {
        note.textContent = "";
        note.classList.remove("is-error");
      }
      try {
        const response = await fetch("/api/hq-login", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ password })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.ok !== true) throw new Error("access_denied");
        window.location.replace(new URLSearchParams(window.location.search).get("return") || "/hq");
      } catch (error) {
        form.password.value = "";
        root.classList.add("is-denied");
        if (note) {
          note.textContent = "Access denied. Please try again.";
          note.classList.add("is-error");
        }
        if (button) button.disabled = false;
        form.classList.remove("is-checking");
        if (label) label.textContent = "Unlock HQ";
        window.setTimeout(() => root.classList.remove("is-denied"), 420);
      }
    };
  }

  function bindHqLogout() {
    const logout = document.getElementById("hq-logout");
    if (!logout) return;
    logout.onclick = async () => {
      logout.disabled = true;
      try {
        await fetch("/api/hq-logout", {
          method: "POST",
          headers: { Accept: "application/json" },
          credentials: "same-origin"
        });
      } catch (error) {}
      try {
        localStorage.removeItem("doneovernight.hqAccess.v1");
      } catch (error) {}
      window.location.replace("/hq/login");
    };
  }

  function bindHqTestToggle() {
    const toggle = document.getElementById("show-test-records");
    if (!toggle) return;
    toggle.onchange = () => {
      save("doneovernight.hqShowTests.v1", toggle.checked);
      mountHq();
    };
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

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
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

  function currentSavedEmail() {
    return read(emailKey, null);
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
