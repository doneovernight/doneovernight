const { unavailable } = require("./utils");

async function getContactSummary() {
  return {
    leads: unavailable("Leads", "Lead source not connected"),
    contacts: unavailable("Contacts", "Contact Registry source not connected"),
    clients: unavailable("Clients", "Client source not connected")
  };
}

module.exports = {
  getContactSummary
};
