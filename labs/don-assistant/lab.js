import { DONAssistant } from "/components/don-assistant/don-assistant.js";

const gate = document.querySelector("#accessGate");
const site = document.querySelector("#labSite");
const note = document.querySelector("#accessNote");
const loginLink = document.querySelector("#loginLink");

function unlockLab() {
  document.body.classList.remove("is-locked");
  gate.hidden = true;
  site.hidden = false;
  startPrototype();
}

async function authorize() {
  const local = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  if (local) {
    unlockLab();
    return;
  }

  try {
    const response = await fetch("/api/hq-session", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("unauthorized");
    unlockLab();
  } catch (error) {
    note.textContent = "An active HQ session is required before this internal prototype can open.";
    loginLink.hidden = false;
  }
}

function startPrototype() {
  const desktop = new DONAssistant(document.querySelector("#desktopAssistant"));
  const mobile = new DONAssistant(document.querySelector("#mobileAssistant"), {
    message: "Your next step is ready."
  });
  const output = document.querySelector("#stateOutput");
  const controls = document.querySelector("#stateControls");
  const reduceMotion = document.querySelector("#reduceMotion");
  const systemPreference = document.querySelector("#systemPreference");
  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  function renderState(state) {
    output.value = state;
    output.textContent = state.replaceAll("_", " ");
    controls.querySelectorAll("[data-state]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.state === state));
    });
  }

  function setState(state) {
    if (state === "triple_jump") {
      desktop.jump("lab-control");
      mobile.jump("lab-control");
      return;
    }
    if (state === "success") {
      desktop.success("lab-control");
      mobile.success("lab-control");
      return;
    }
    if (state === "collapsed" || state === "expanded") {
      const expanded = state === "expanded";
      desktop.setExpanded(expanded);
      mobile.setExpanded(expanded);
      return;
    }
    desktop.setState(state, { source: "lab-control" });
    mobile.setState(state, { source: "lab-control" });
  }

  controls.addEventListener("click", (event) => {
    const button = event.target.closest("[data-state]");
    if (!button) return;
    setState(button.dataset.state);
  });

  document.querySelector("#messageSelect").addEventListener("change", (event) => {
    desktop.setMessage(event.target.value);
    mobile.setMessage(event.target.value);
  });
  document.querySelector("#expandBubble").addEventListener("click", () => setState("expanded"));
  document.querySelector("#collapseBubble").addEventListener("click", () => setState("collapsed"));
  document.querySelector("#successEvent").addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("donassistant:success"));
  });

  reduceMotion.addEventListener("change", () => {
    desktop.setReducedMotion(reduceMotion.checked);
    mobile.setReducedMotion(reduceMotion.checked);
  });

  function renderSystemPreference() {
    systemPreference.textContent = mediaQuery.matches
      ? "System preference: reduced motion"
      : "System preference: standard motion";
  }

  mediaQuery.addEventListener?.("change", renderSystemPreference);
  desktop.machine.subscribe(({ state }) => renderState(state));
  renderState(desktop.machine.state);
  renderSystemPreference();

  let cumulativeLayoutShift = 0;
  if ("PerformanceObserver" in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (!entry.hadRecentInput) cumulativeLayoutShift += entry.value;
        });
        document.querySelector("#clsMetric").textContent = `${cumulativeLayoutShift.toFixed(3)} CLS`;
      });
      observer.observe({ type: "layout-shift", buffered: true });
    } catch (error) {}
  }

  window.__donAssistantLab = { desktop, mobile, setState };
}

authorize();
